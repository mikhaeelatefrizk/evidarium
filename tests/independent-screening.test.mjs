import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readdir,copyFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {handleApi} from '../lib/core.mjs';
import {createDB,createBucket} from '../companion/storage.mjs';
import {SCREENING_LIMITS,claimScreeningFileDeletion,releaseScreeningFileDeletion} from '../lib/independent-screening.mjs';

const migrations=fileURLToPath(new URL('../drizzle',import.meta.url));
const identities={alice:{userId:'alice',email:'owner@example.org',displayName:'Owner'},bob:{userId:'bob',email:'bob@example.org',displayName:'Reviewer B'},cara:{userId:'cara',email:'cara@example.org',displayName:'Reviewer C'},eve:{userId:'eve',email:'eve@example.org',displayName:'Other'}};
const digest=s=>createHash('sha256').update(s).digest('hex');
async function payload(response,status=200){const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
async function setup(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-independent-')),db=createDB(path.join(root,'db'),migrations),bucket=createBucket(path.join(root,'files'));
 t.after(async()=>{db.close();await rm(root,{recursive:true,force:true})});
 const call=(route,method='GET',body,actor='alice',extra={})=>handleApi(new Request('https://example.invalid/api/'+route,{method,headers:{'content-type':'application/json',...extra.headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{db,bucket,user:actor?identities[actor]:null,local:extra.local??false});
 const p=await payload(await call('projects','POST',{title:'مراجعة مستقلة',question:'Does treatment help?',criteria:'Controlled adult trials'}),201),base='screening/projects/'+p.id;
 const [source]=await payload(await call('projects/'+p.id+'/sources','POST',{title:'A controlled study',abstract:'Forty-two adults received the intervention for six months.',doi:'10.1/controlled'}));
 const invite=async(actor='bob')=>payload(await call(base+'/invitations','POST',{email:identities[actor].email}),201);
 const join=async(actor='bob')=>{const invitation=await invite(actor);await payload(await call('screening/invitations/accept','POST',{token:invitation.token},actor));return invitation;};
 const round=async(reviewers=['alice','bob'],stage='title_abstract')=>payload(await call(base+'/rounds','POST',{sourceId:source.id,stage,reviewerIds:reviewers,reason:'Start independent review'}),201);
 const submit=(r,actor,decision='include',reason='')=>call(base+'/rounds/'+r.id+'/decision','PUT',{decision,reason,revision:0},actor);
 return {root,db,bucket,call,p,base,source,invite,join,round,submit};
}

test('email-bound invitation stores only a hash and is consumed once by the intended identity',async t=>{
 const f=await setup(t),inv=await f.invite();assert.match(inv.token,/^[a-f0-9]{64}$/);const row=f.db.raw.prepare('SELECT * FROM screening_invitations').get();assert.equal(row.token_hash,digest(inv.token));assert.ok(!JSON.stringify(row).includes(inv.token));
 assert.equal((await f.call('screening/invitations/accept','POST',{token:inv.token},'eve')).status,404);
 await payload(await f.call('screening/invitations/accept','POST',{token:inv.token},'bob'));assert.equal((await f.call('screening/invitations/accept','POST',{token:inv.token},'bob')).status,404);
 const team=await payload(await f.call(f.base+'/team'));assert.equal(team.members[0].userId,'bob');assert.equal(team.members[0].revision,1);assert.ok(!JSON.stringify(team).includes(row.token_hash));assert.ok(!JSON.stringify(team).includes(inv.token));
 const shared=await payload(await f.call('screening/shared','GET',undefined,'bob'));assert.deepEqual(shared.projects,[{id:f.p.id,title:'مراجعة مستقلة',role:'reviewer'}]);
});
test('expired, cancelled, malformed and self invitations cannot grant access',async t=>{
 const f=await setup(t);assert.equal((await f.call(f.base+'/invitations','POST',{email:identities.alice.email})).status,400);
 const a=await f.invite();f.db.raw.prepare('UPDATE screening_invitations SET expires=0 WHERE id=?').run(a.id);assert.equal((await f.call('screening/invitations/accept','POST',{token:a.token},'bob')).status,404);
 const b=await f.invite();await payload(await f.call(f.base+'/invitations/'+b.id+'/cancel','POST',{revision:1}));assert.equal((await f.call('screening/invitations/accept','POST',{token:b.token},'bob')).status,404);
 assert.equal((await f.call('screening/invitations/accept','POST',{token:'guess'},'bob')).status,404);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_members').get().n,0);
});
test('concurrent invitation redemptions create exactly one membership and acceptance event',async t=>{
 const f=await setup(t),inv=await f.invite(),responses=await Promise.all([1,2].map(()=>f.call('screening/invitations/accept','POST',{token:inv.token},'bob')));
 assert.equal(responses.filter(r=>r.status===200).length,1);assert.ok(responses.every(r=>[200,404,409].includes(r.status)));assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_members').get().n,1);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM screening_events WHERE action='invitation.accepted'").get().n,1);
});
test('reviewer access never expands to owner APIs or other projects',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();
 for(const route of ['projects/'+f.p.id,'projects/'+f.p.id+'/export','projects/'+f.p.id+'/review','projects/'+f.p.id+'/screening-ledger',f.base+'/team',f.base+'/export'])assert.equal((await f.call(route,'GET',undefined,'bob')).status,404,route);
 assert.equal((await f.call('sources/'+f.source.id,'PATCH',{decision:'exclude',reason:'Overwrite',stage:'title_abstract'},'bob')).status,404);
 assert.equal((await f.call(f.base+'/invitations','POST',{email:identities.cara.email},'bob')).status,404);
 assert.equal((await f.call(f.base+'/rounds/'+r.id+'/cancel','POST',{reason:'Delete',revision:1},'bob')).status,404);
 assert.equal((await f.call(f.base+'/rounds/'+r.id,'GET',undefined,'eve')).status,404);
 const other=await payload(await f.call('projects','POST',{title:'Other'}),201);assert.equal((await f.call('screening/projects/'+other.id+'/rounds/'+r.id)).status,404);
});
test('local edition, signed-out access and cross-origin screening writes are refused',async t=>{
 const f=await setup(t);assert.equal((await f.call('screening/shared','GET',undefined,null)).status,401);assert.equal((await f.call('screening/shared','GET',undefined,'alice',{local:true})).status,409);
 assert.equal((await f.call(f.base+'/invitations','POST',{email:identities.bob.email},'alice',{headers:{origin:'https://foreign.invalid'}})).status,403);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_invitations').get().n,0);
});
test('round requires distinct active identities and captures evidence without legacy screening labels',async t=>{
 const f=await setup(t);assert.equal((await f.call(f.base+'/rounds','POST',{sourceId:f.source.id,stage:'title_abstract',reviewerIds:['alice','alice'],reason:'Start'})).status,400);
 assert.equal((await f.call(f.base+'/rounds','POST',{sourceId:f.source.id,stage:'title_abstract',reviewerIds:['alice','bob'],reason:'Start'})).status,409);
 await f.join();await payload(await f.call('sources/'+f.source.id,'PATCH',{decision:'exclude',stage:'title_abstract',reason:'OLD PRIVATE REASON'}));const r=await f.round();
 assert.equal(r.snapshot.criteria,'Controlled adult trials');assert.equal(r.snapshot.source.title,'A controlled study');assert.equal(r.snapshotHash,digest(JSON.stringify(r.snapshot)));assert.equal(r.snapshot.source.decision,undefined);assert.ok(!JSON.stringify(r).includes('OLD PRIVATE REASON'));
 await payload(await f.call('projects/'+f.p.id,'PATCH',{criteria:'New criteria'}));f.db.raw.prepare('UPDATE sources SET abstract=? WHERE id=?').run('New evidence',f.source.id);
 const read=await payload(await f.call(f.base+'/rounds/'+r.id,'GET',undefined,'bob'));assert.equal(read.snapshot.criteria,'Controlled adult trials');assert.equal(read.snapshot.source.abstract,'Forty-two adults received the intervention for six months.');assert.equal(read.snapshotHash,r.snapshotHash);
});
test('peer decisions stay hidden from the owner reviewer, team, legacy exports and pending archive',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();await payload(await f.submit(r,'bob','exclude','PRIVATE PEER RATIONALE'));
 for(const route of [f.base+'/rounds',f.base+'/rounds/'+r.id,f.base+'/team','projects/'+f.p.id,'projects/'+f.p.id+'/export','projects/'+f.p.id+'/screening-ledger']){const response=await f.call(route);assert.equal(response.status,200);assert.ok(!(await response.text()).includes('PRIVATE PEER RATIONALE'),route);}
 const archive=await payload(await f.call(f.base+'/export'));assert.equal(archive.complete,false);assert.equal(archive.concealedDecisionEvents,1);assert.equal(archive.rounds[0].decisions,null);assert.ok(!JSON.stringify(archive).includes('PRIVATE PEER RATIONALE'));
 const own=await payload(await f.call(f.base+'/rounds/'+r.id,'GET',undefined,'bob'));assert.equal(own.ownDecision.reason,'PRIVATE PEER RATIONALE');assert.equal(own.canSubmit,false);assert.equal(own.decisions,null);
});
test('two matching independent submissions finalize consensus without overwriting legacy records',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();const responses=await Promise.all([f.submit(r,'alice'),f.submit(r,'bob')]);for(const response of responses)await payload(response);
 const result=await payload(await f.call(f.base+'/rounds/'+r.id));assert.equal(result.status,'consensus');assert.equal(result.revision,3);assert.equal(result.finalDecision,'include');assert.equal(result.decisions.length,2);assert.equal(result.canResolve,false);
 assert.equal(f.db.raw.prepare('SELECT decision FROM sources WHERE id=?').get(f.source.id).decision,'unknown');assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM screening_events WHERE action='decision.submitted'").get().n,2);
 assert.equal((await f.submit(r,'bob','exclude','Change')).status,409);const archive=await payload(await f.call(f.base+'/export'));assert.equal(archive.complete,true);assert.equal(archive.events.filter(e=>e.action==='decision.submitted').length,2);
});
test('a conflict needs owner adjudication with a reason and the exact current revision',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();await payload(await f.submit(r,'alice'));const conflict=await payload(await f.submit(r,'bob','exclude','Wrong design'));
 assert.equal(conflict.status,'conflict');assert.equal(conflict.finalDecision,null);assert.equal(conflict.decisions.length,2);
 const endpoint=f.base+'/rounds/'+r.id+'/resolve';assert.equal((await f.call(endpoint,'POST',{decision:'include',reason:'',revision:3})).status,400);assert.equal((await f.call(endpoint,'POST',{decision:'include',reason:'Review',revision:1})).status,409);assert.equal((await f.call(endpoint,'POST',{decision:'include',reason:'Review',revision:3},'bob')).status,404);
 const done=await payload(await f.call(endpoint,'POST',{decision:'exclude',reason:'تمت مراجعة تصميم الدراسة',revision:3}));assert.equal(done.status,'resolved');assert.equal(done.finalDecision,'exclude');assert.equal(done.resolvedBy,'alice');assert.equal(done.revision,4);assert.equal(done.decisions[0].decision,'include');assert.equal((await f.call(endpoint,'POST',{decision:'include',reason:'Overwrite',revision:4})).status,409);
});
test('concurrent duplicate submissions preserve exactly one immutable decision and event',async t=>{
 const f=await setup(t);await f.join();const r=await f.round(),responses=await Promise.all([f.submit(r,'bob','include'),f.submit(r,'bob','exclude','Alternate')]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
 const rows=f.db.raw.prepare('SELECT * FROM screening_decisions WHERE round_id=? AND reviewer=?').all(r.id,'bob');assert.equal(rows.length,1);assert.equal(rows[0].revision,1);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM screening_events WHERE round_id=? AND action='decision.submitted'").get(r.id).n,1);
});
test('atomic failure cannot leave a submitted decision without its audit event',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();f.db.raw.exec("CREATE TRIGGER fail_screening_event BEFORE INSERT ON screening_events WHEN NEW.action='decision.submitted' BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
 assert.equal((await f.submit(r,'bob')).status,500);assert.equal(f.db.raw.prepare('SELECT submitted FROM screening_decisions WHERE round_id=? AND reviewer=?').get(r.id,'bob').submitted,null);assert.equal(f.db.raw.prepare('SELECT revision FROM screening_rounds WHERE id=?').get(r.id).revision,1);
 f.db.raw.exec('DROP TRIGGER fail_screening_event');await payload(await f.submit(r,'bob'));
});
test('revocation blocks reads and writes while preserving history and does not revive old assignments',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();await payload(await f.submit(r,'bob','exclude','Historical decision'));await payload(await f.call(f.base+'/members/bob/revoke','POST',{revision:1}));
 assert.equal((await f.call(f.base+'/rounds/'+r.id,'GET',undefined,'bob')).status,404);assert.equal((await f.submit(r,'bob')).status,404);assert.equal(f.db.raw.prepare('SELECT decision FROM screening_decisions WHERE round_id=? AND reviewer=?').get(r.id,'bob').decision,'exclude');
 assert.deepEqual((await payload(await f.call('screening/shared','GET',undefined,'bob'))).projects,[]);await f.join();assert.equal((await f.call(f.base+'/rounds/'+r.id,'GET',undefined,'bob')).status,404);assert.equal((await payload(await f.call(f.base+'/rounds','GET',undefined,'bob'))).rounds.length,0);
});
test('membership revocation between request authorization and SQL commit rejects a late write',async t=>{
 const f=await setup(t);await f.join();const r=await f.round(),originalPrepare=f.db.prepare,originalBatch=f.db.batch;let once=true;
 f.db.prepare=function(sql){const stmt=originalPrepare.call(this,sql);const bind=stmt.bind;stmt.bind=function(...args){bind.apply(this,args);this.testSql=sql;return this};return stmt};
 f.db.batch=async function(statements){if(once&&statements.some(s=>s.testSql?.startsWith('UPDATE screening_decisions'))){once=false;f.db.raw.prepare("UPDATE screening_members SET status='revoked',revision=revision+1 WHERE project=? AND user_id='bob'").run(f.p.id);}return originalBatch.call(this,statements)};
 assert.equal((await f.submit(r,'bob')).status,409);assert.equal(f.db.raw.prepare('SELECT submitted FROM screening_decisions WHERE round_id=? AND reviewer=?').get(r.id,'bob').submitted,null);
});
test('cancellation preserves concealed decisions and replacements use a distinct numbered snapshot',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();await payload(await f.submit(r,'bob','exclude','Never disclosed'));const cancelled=await payload(await f.call(f.base+'/rounds/'+r.id+'/cancel','POST',{reason:'Correct criteria before continuing',revision:2}));assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.decisions,null);assert.equal((await f.submit(r,'alice')).status,409);
 const next=await f.round();assert.equal(next.round,2);assert.notEqual(next.id,r.id);assert.equal(next.ownDecision.decision,null);const archive=await payload(await f.call(f.base+'/export'));assert.equal(archive.rounds.length,2);assert.equal(archive.complete,false);assert.ok(!JSON.stringify(archive).includes('Never disclosed'));
});
test('two competing round creations cannot create two active rounds for the same source and stage',async t=>{
 const f=await setup(t);await f.join();const b={sourceId:f.source.id,stage:'title_abstract',reviewerIds:['alice','bob'],reason:'Start'},responses=await Promise.all([f.call(f.base+'/rounds','POST',b),f.call(f.base+'/rounds','POST',b)]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_rounds').get().n,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_decisions').get().n,2);
});
test('full-text reviewers receive only linked originals and immutable extracted text',async t=>{
 const f=await setup(t);await f.join();const b={sourceId:f.source.id,stage:'full_text',reviewerIds:['alice','bob'],reason:'Read complete article'};assert.equal((await f.call(f.base+'/rounds','POST',b)).status,400);
 const content='Original trial evidence: forty-two participants.',file='linked-file',sha=digest(content),key='alice/'+f.p.id+'/'+file;await f.bucket.put(key,new TextEncoder().encode(content));
 f.db.raw.prepare('INSERT INTO files(id,project,name,mime,size,key,status,extracted,sha256,source_id,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(file,f.p.id,'الدراسة.txt','text/plain',Buffer.byteLength(content),key,'extracted',JSON.stringify({segments:[{location:'text',text:content}]}),sha,f.source.id,1);
 const r=await payload(await f.call(f.base+'/rounds','POST',b),201);assert.equal(r.snapshot.files[0].text.segments[0].text,content);
 const download=await f.call(f.base+'/rounds/'+r.id+'/evidence/'+file,'GET',undefined,'bob');assert.equal(download.status,200);assert.equal(await download.text(),content);assert.equal(download.headers.get('x-evidence-sha256'),sha);
 assert.equal((await f.call('files/'+file,'GET',undefined,'bob')).status,404);assert.equal((await f.call(f.base+'/rounds/'+r.id+'/evidence/unrelated','GET',undefined,'bob')).status,404);assert.equal((await f.call('files/'+file,'DELETE')).status,409);
 f.db.raw.prepare('UPDATE files SET sha256=? WHERE id=?').run('different',file);assert.equal((await f.call(f.base+'/rounds/'+r.id+'/evidence/'+file,'GET',undefined,'bob')).status,409);
 const saved=await payload(await f.call(f.base+'/rounds/'+r.id,'GET',undefined,'bob'));assert.equal(saved.snapshot.files[0].sha256,sha);
});
test('owner coordinator can assign two members but cannot submit as either identity',async t=>{
 const f=await setup(t);await f.join('bob');await f.join('cara');const r=await f.round(['bob','cara']);assert.equal(r.ownDecision,null);assert.equal((await f.submit(r,'alice')).status,403);await payload(await f.submit(r,'bob'));const before=await payload(await f.call(f.base+'/rounds/'+r.id));assert.equal(before.decisions,null);const done=await payload(await f.submit(r,'cara'));assert.equal(done.status,'consensus');
});
test('new screening migration preserves existing project, source and audit values',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-screening-migrate-')),old=path.join(root,'old'),file=path.join(root,'db');await mkdir(old);for(const name of await readdir(migrations))if(name.endsWith('.sql')&&name<'0008')await copyFile(path.join(migrations,name),path.join(old,name));
 let db=createDB(file,old);db.raw.prepare('INSERT INTO projects(id,owner,title,question,criteria,created,updated) VALUES(?,?,?,?,?,?,?)').run('existing','alice','رسالة محفوظة','question','criteria',1,2);db.raw.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run('original-event','existing','original','{"untouched":true}',3);const before=db.raw.prepare('SELECT * FROM projects').get();db.close();
 db=createDB(file,migrations);t.after(async()=>{db.close();await rm(root,{recursive:true,force:true})});assert.deepEqual(db.raw.prepare('SELECT * FROM projects').get(),before);assert.equal(db.raw.prepare('SELECT detail FROM audit').get().detail,'{"untouched":true}');assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM screening_members').get().n,0);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM screening_rounds').get().n,0);
});
test('review assignments require saved eligibility criteria',async t=>{
 const f=await setup(t);await f.join();await payload(await f.call('projects/'+f.p.id,'PATCH',{criteria:''}));const body={sourceId:f.source.id,stage:'title_abstract',reviewerIds:['alice','bob'],reason:'Start'};assert.equal((await f.call(f.base+'/rounds','POST',body)).status,400);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_rounds').get().n,0);
});
test('round list is paginated with small summaries and bounded database query count',async t=>{
 const f=await setup(t);await f.join();for(let i=0;i<27;i++){const r=await f.round();await payload(await f.call(f.base+'/rounds/'+r.id+'/cancel','POST',{reason:'Correction '+i,revision:1}));}
 const original=f.db.prepare;let queries=0;f.db.prepare=function(...args){queries++;return original.apply(this,args)};
 const firstPage=await payload(await f.call(f.base+'/rounds'));assert.equal(firstPage.rounds.length,25);assert.equal(firstPage.hasMore,true);assert.equal(firstPage.nextOffset,25);assert.ok(queries<=5,'queries='+queries);assert.deepEqual(Object.keys(firstPage.rounds[0].snapshot),['source']);assert.equal(firstPage.rounds[0].snapshot.source.title,'A controlled study');
 const second=await payload(await f.call(f.base+'/rounds?offset=25'));assert.equal(second.rounds.length,2);assert.equal(second.hasMore,false);assert.equal(new Set([...firstPage.rounds,...second.rounds].map(r=>r.id)).size,27);assert.equal((await f.call(f.base+'/rounds?offset=-1')).status,400);
});
test('aggregate snapshot allowance is enforced inside the write and preserves existing rounds',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();await payload(await f.call(f.base+'/rounds/'+r.id+'/cancel','POST',{reason:'Retain',revision:1}));
 // Seed historical volume directly; the test isolates the atomic capacity predicate.
 f.db.raw.prepare('UPDATE screening_rounds SET snapshot=? WHERE id=?').run(JSON.stringify({padding:'x'.repeat(SCREENING_LIMITS.projectSnapshotBytes)}),r.id);
 const response=await f.call(f.base+'/rounds','POST',{sourceId:f.source.id,stage:'title_abstract',reviewerIds:['alice','bob'],reason:'Would exceed'});assert.equal(response.status,409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_rounds').get().n,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_decisions').get().n,2);
});
test('file deletion claim and snapshot creation are mutually exclusive in both interleavings',async t=>{
 const f=await setup(t);await f.join();const content='Saved original evidence',file='race-file',sha=digest(content),key='alice/'+f.p.id+'/'+file;await f.bucket.put(key,new TextEncoder().encode(content));
 f.db.raw.prepare('INSERT INTO files(id,project,name,mime,size,key,status,sha256,source_id,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run(file,f.p.id,'evidence.txt','text/plain',content.length,key,'stored',sha,f.source.id,1);
 const body={sourceId:f.source.id,stage:'full_text',reviewerIds:['alice','bob'],reason:'Read evidence'},originalPrepare=f.db.prepare,originalBatch=f.db.batch;let claim=null,once=true;
 f.db.prepare=function(sql){const stmt=originalPrepare.call(this,sql),bind=stmt.bind;stmt.bind=function(...args){bind.apply(this,args);this.testSql=sql;return this};return stmt};
 f.db.batch=async function(statements){if(once&&statements.some(s=>s.testSql?.startsWith('INSERT INTO screening_rounds'))){once=false;claim=await claimScreeningFileDeletion(f.db,file);}return originalBatch.call(this,statements)};
 assert.equal((await f.call(f.base+'/rounds','POST',body)).status,409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_rounds').get().n,0);assert.equal(f.db.raw.prepare('SELECT status FROM files WHERE id=?').get(file).status,'deleting');
 await releaseScreeningFileDeletion(f.db,claim);assert.equal(f.db.raw.prepare('SELECT status FROM files WHERE id=?').get(file).status,'stored');
 const r=await payload(await f.call(f.base+'/rounds','POST',body),201);await assert.rejects(()=>claimScreeningFileDeletion(f.db,file),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT status FROM files WHERE id=?').get(file).status,'stored');assert.equal((await f.call(f.base+'/rounds/'+r.id+'/evidence/'+file,'GET',undefined,'bob')).status,200);
});
test('revoking either assignment prevents a remaining reviewer from silently completing an obsolete pair',async t=>{
 const f=await setup(t);await f.join();const r=await f.round();await payload(await f.submit(r,'bob'));await payload(await f.call(f.base+'/members/bob/revoke','POST',{revision:1}));assert.equal((await f.submit(r,'alice')).status,409);const state=await payload(await f.call(f.base+'/rounds/'+r.id));assert.equal(state.status,'open');assert.equal(state.canSubmit,false);assert.equal(state.decisions,null);
});
test('snapshot size is bounded in UTF-8 bytes rather than character count',async t=>{
 const f=await setup(t);await f.join();const unicode='界'.repeat(400000),file='unicode-file';
 f.db.raw.prepare('INSERT INTO files(id,project,name,mime,size,key,status,extracted,sha256,source_id,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(file,f.p.id,'中文.txt','text/plain',1200000,'alice/'+f.p.id+'/'+file,'extracted',JSON.stringify({segments:[{location:'text',text:unicode}]}),digest(unicode),f.source.id,1);
 const response=await f.call(f.base+'/rounds','POST',{sourceId:f.source.id,stage:'full_text',reviewerIds:['alice','bob'],reason:'Snapshot'});assert.equal(response.status,400);assert.match((await response.json()).error,/UTF-8/);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM screening_rounds').get().n,0);
});
test('archives export every round and event across bounded versioned pages without duplicating team events',async t=>{
 const f=await setup(t);await f.join();const created=[];for(let i=0;i<12;i++){const r=await f.round();created.push(r.id);await payload(await f.call(f.base+'/rounds/'+r.id+'/cancel','POST',{reason:'Correction '+i,revision:1}));}
 const original=f.db.prepare;let queries=0;f.db.prepare=function(...args){queries++;return original.apply(this,args)};
 const firstPage=await payload(await f.call(f.base+'/export'));assert.equal(firstPage.rounds.length,10);assert.equal(firstPage.pagination.nextOffset,10);assert.equal(firstPage.complete,false);assert.ok(queries<=10,'queries='+queries);
 assert.equal((await f.call(f.base+'/export?offset=10')).status,400);
 const second=await payload(await f.call(f.base+'/export?offset=10&version='+firstPage.archiveVersion));assert.equal(second.rounds.length,2);assert.equal(second.pagination.hasMore,false);assert.equal(second.complete,false);assert.deepEqual([...firstPage.rounds,...second.rounds].map(r=>r.id),created);
 assert.equal(second.events.filter(e=>!e.round_id).length,0);assert.equal(new Set([...firstPage.events,...second.events].map(e=>e.id)).size,f.db.raw.prepare('SELECT COUNT(*) n FROM screening_events').get().n);
 await f.invite('cara');assert.equal((await f.call(f.base+'/export?offset=10&version='+firstPage.archiveVersion)).status,409);
});
test('archive refuses a page if an authorized write changes records during export',async t=>{
 const f=await setup(t);await f.join();const r=await f.round(),originalPrepare=f.db.prepare;let once=true;
 f.db.prepare=function(sql){if(once&&sql.startsWith('SELECT id,round_id,action,actor,detail,created FROM screening_events')){once=false;f.db.raw.prepare('INSERT INTO screening_events VALUES(?,?,?,?,?,?,?)').run('concurrent-event',f.p.id,r.id,'round.concurrent','alice','{}',Date.now());}return originalPrepare.call(this,sql)};
 const response=await f.call(f.base+'/export');assert.equal(response.status,409);assert.match((await response.json()).error,/Restart/);
});

test('snapshot checksum mismatch prevents detail, submissions and archival presentation as intact evidence',async t=>{
 const f=await setup(t);await f.join();const r=await f.round(),stored=f.db.raw.prepare('SELECT snapshot FROM screening_rounds WHERE id=?').get(r.id),changed=JSON.parse(stored.snapshot);changed.criteria='Altered after assignment';f.db.raw.prepare('UPDATE screening_rounds SET snapshot=? WHERE id=?').run(JSON.stringify(changed),r.id);
 for(const response of [await f.call(f.base+'/rounds/'+r.id),await f.submit(r,'bob'),await f.call(f.base+'/export')]){assert.equal(response.status,409);assert.match((await response.json()).error,/checksum/);}
 assert.equal(f.db.raw.prepare('SELECT count(*) n FROM screening_decisions WHERE submitted IS NOT NULL').get().n,0);
});
