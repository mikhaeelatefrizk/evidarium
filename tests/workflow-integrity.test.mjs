import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDB,createBucket} from '../companion/storage.mjs';
import {handleApi} from '../lib/core.mjs';
import {emptyReview} from '../lib/review-model.mjs';

const migrations=fileURLToPath(new URL('../drizzle',import.meta.url));
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-integrity-'));
 const filename=path.join(root,'research.sqlite');
 const bucket=createBucket(path.join(root,'files'));
 let db=createDB(filename,migrations);
 const call=(route,method='GET',body,userId='researcher',override={})=>handleApi(new Request('https://test.invalid/api/'+route,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),{db,bucket,user:userId?{userId,email:userId+'@example.invalid'}:null,...override});
 const restart=()=>{db.close();db=createDB(filename,migrations);};
 t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});
 const project=await(await call('projects','POST',{title:'أمان السجل البحثي',question:'A defined research question',criteria:'An explicit inclusion rule'})).json();
 async function upload(name,content){
  const bytes=Buffer.from(content),f=await(await call('projects/'+project.id+'/files','POST',{name,size:bytes.length,mime:'text/plain'})).json();
  const response=await handleApi(new Request('https://test.invalid/api/files/'+f.id+'/part?n=1',{method:'PUT',body:bytes,headers:{'x-part-sha256':createHash('sha256').update(bytes).digest('hex')}}),{db,bucket,user:{userId:'researcher'}});
  assert.equal(response.status,200);assert.equal((await call('files/'+f.id+'/complete','POST',{})).status,200);return f;
 }
 return {call,project,upload,restart,bucket,get db(){return db;}};
}

test('a saved evidence-to-manuscript workflow survives database restart with original bytes and reproducible result provenance',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id;
 const quote='The recorded sample contains 42 participants at six months.';
 const [source]=await(await f.call(prefix+'/sources','POST',{title:'A known report',abstract:quote,doi:'10.1234/restart'})).json();
 const file=await f.upload('evidence.txt',quote+'\nالعينة الأصلية محفوظة.');
 const extract=await(await f.call('tasks','POST',{project:f.project.id,kind:'web_extract_text',args:{file_id:file.id}})).json();
 assert.equal((await(await f.call('tasks/'+extract.id+'/approve','POST',{})).json()).state,'completed');
 const claim=await(await f.call(prefix+'/claims','POST',{statement:'The report records 42 participants.',stance:'supports',file_id:file.id,location:'text',quote})).json();
 assert.equal(claim.interpretationVerified,false);
 const review=emptyReview();review.protocol.question='ما حجم العينة عند ستة أشهر؟';
 review.studies=[{id:'study-1',label:'Study one',design:'fixture',notes:'',sourceIds:[source.id]}];
 review.extractions=[{id:'extraction-1',studyId:'study-1',sourceId:source.id,fileId:file.id,location:'text',field:'sample size',value:'42',unit:'participants',timepoint:'six months',quote,reviewStatus:'unchecked'}];
 const saved=await f.call(prefix+'/review','PUT',{data:review,revision:0,reason:'Evidence extracted for independent checking'});assert.equal(saved.status,200,await saved.clone().text());
 const draft=await(await f.call(prefix+'/manuscripts','POST',{title:'نتائج المراجعة'})).json();
 assert.equal((await f.call(prefix+'/manuscripts/'+draft.id,'PUT',{title:draft.title,content:'The recorded sample was 42 [S:'+source.id+'].',revision:1})).status,200);
 const before=await(await f.call(prefix+'/export')).json();
 const rawBefore=Buffer.from(await(await f.call('files/'+file.id)).arrayBuffer());
 f.restart();
 const after=await(await f.call(prefix+'/export')).json();
 for(const key of ['project','sources','files','claims','tasks','manuscripts','review_workspace'])assert.deepEqual(after[key],before[key],key+' changed across restart');
 assert.deepEqual(Buffer.from(await(await f.call('files/'+file.id)).arrayBuffer()),rawBefore);
 assert.equal((await(await f.call(prefix+'/review/history/1')).json()).data.extractions[0].quote,quote);
 assert.equal((await(await f.call(prefix+'/manuscripts/'+draft.id+'/revisions/2')).json()).content,before.manuscripts[0].content);
 const result=JSON.parse(after.tasks.find(x=>x.id===extract.id).result);
 assert.equal(result.provenance.input_sha256,createHash('sha256').update(rawBefore).digest('hex'));
 assert.equal(result.result.complete,true);
 for(const [route,method,body] of [[prefix+'/export','GET'],['files/'+file.id,'GET'],['files/'+file.id,'DELETE'],[prefix+'/review/history/1','GET'],[prefix+'/manuscripts/'+draft.id+'/export','GET'],['tasks/'+extract.id+'/approve','POST',{}]])assert.equal((await f.call(route,method,body,'another-researcher')).status,404,route+' crossed account boundary');
});

test('malformed later import entries cannot leave a partially imported project',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id;
 const valid={id:'external-source',title:'A valid first record',abstract:'Evidence that must not be partly imported.'};
 const cases=[
  {sources:[valid,{id:'bad-source',title:''}]},
  {sources:[valid],notes:[null]},
  {sources:[valid],messages:[null]},
  {sources:[valid],tasks:[null]},
  {sources:[valid],claims:[null]},
  {sources:[valid,{id:'bad-metadata',title:'Bad metadata',metadata:'{broken'}]},
 ];
 for(const input of cases){
  const before=await(await f.call(prefix)).json();
  const response=await f.call(prefix+'/import','POST',{schema:'evidarium.project.v1',project:{question:'Should never replace the question'},...input});
  assert(response.status>=400,'Malformed import unexpectedly succeeded');
  const after=await(await f.call(prefix)).json();
  assert.deepEqual(after,before,'Rejected import changed saved project data: '+JSON.stringify(input));
 }
});

test('duplicate imported source IDs cannot silently retarget citations to a different paper',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id;
 const before=await(await f.call(prefix)).json();
 const response=await f.call(prefix+'/import','POST',{schema:'evidarium.project.v1',sources:[{id:'same-id',title:'Original evidence',doi:'10.1/original'},{id:'same-id',title:'Different evidence',doi:'10.1/different'}],manuscripts:[{id:'draft',title:'Draft',content:'A supported claim [S:same-id].'}]});
 assert.equal(response.status,400);
 assert.deepEqual(await(await f.call(prefix)).json(),before);
});

test('an import cannot overwrite a protocol changed while the import was being prepared',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id,before=await(await f.call(prefix)).json();
 const concurrentDb={...f.db,batch(statements){f.db.raw.prepare('UPDATE projects SET question=?,updated=updated+1 WHERE id=?').run('A concurrent protocol correction',f.project.id);return f.db.batch(statements);}};
 const response=await f.call(prefix+'/import','POST',{schema:'evidarium.project.v1',project:{question:'An older imported protocol'},sources:[{id:'incoming',title:'A report'}],notes:[{content:'An imported note'}]},'researcher',{db:concurrentDb});
 assert.equal(response.status,409);
 const after=await(await f.call(prefix)).json();assert.equal(after.project.question,'A concurrent protocol correction');
 for(const collection of ['sources','notes','messages','claims','tasks','manuscripts','audit'])assert.deepEqual(after[collection],before[collection],collection+' was partially imported');
});

test('oversize multibyte import rows are rejected before saving any research records',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id,before=await(await f.call(prefix)).json();
 const response=await f.call(prefix+'/import','POST',{schema:'evidarium.project.v1',sources:[{id:'incoming',title:'A report'}],audit:[{detail:'研'.repeat(650000)}]});
 assert.equal(response.status,400);
 assert.deepEqual(await(await f.call(prefix)).json(),before);
});

test('reference deduplication cannot import one report into two different studies',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id,before=await(await f.call(prefix)).json(),data=emptyReview();
 data.studies=[{id:'study-one',label:'First proposed study',sourceIds:['first']},{id:'study-two',label:'Second proposed study',sourceIds:['second']}];
 const response=await f.call(prefix+'/import','POST',{schema:'evidarium.project.v1',sources:[{id:'first',title:'The original report',doi:'10.1234/same-report'},{id:'second',title:'Another description of the same report',doi:'10.1234/same-report'}],review_workspace:{revision:1,data}});
 assert.equal(response.status,400);
 assert.deepEqual(await(await f.call(prefix)).json(),before);
});

test('failed import transaction leaves every collection and protocol unchanged and can be retried',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id,before=await(await f.call(prefix)).json();
 const payload={schema:'evidarium.project.v1',sources:[{id:'external',title:'Imported evidence'}],notes:[{content:'A preserved note'}],manuscripts:[{id:'draft',title:'A chapter',content:'A statement [S:external].'}],project:{question:'The imported question',criteria:'Imported criteria'}};
 const failingDb={...f.db,batch(statements){return f.db.batch([...statements.slice(0,3),f.db.prepare('INSERT INTO deliberately_missing_integrity_table VALUES (1)'),...statements.slice(3)]);}};
 assert.equal((await f.call(prefix+'/import','POST',payload,'researcher',{db:failingDb})).status,500);
 assert.deepEqual(await(await f.call(prefix)).json(),before);
 assert.equal(f.db.raw.prepare('SELECT count(*) n FROM reference_locks').get().n,0);
 f.restart();
 assert.equal((await f.call(prefix+'/import','POST',payload)).status,200);
 const after=await(await f.call(prefix)).json();assert.equal(after.sources.length,1);assert.equal(after.notes.length,1);assert.equal(after.manuscripts.length,1);assert.equal(after.project.question,payload.project.question);
});

test('citation remapping matches complete source IDs and never rewrites an ID prefix',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id;
 const payload={schema:'evidarium.project.v1',sources:[{id:'paper',title:'First report'},{id:'paper-longer',title:'Second report'}],manuscripts:[{id:'chapter',title:'Findings',content:'First [S:paper]; second [S:paper-longer]; locator [S:paper-longer, page 2].'}]};
 assert.equal((await f.call(prefix+'/import','POST',payload)).status,200);
 const after=await(await f.call(prefix+'/export')).json(),first=after.sources.find(s=>s.title==='First report'),second=after.sources.find(s=>s.title==='Second report');
 assert.equal(after.manuscripts[0].content,`First [S:${first.id}]; second [S:${second.id}]; locator [S:${second.id}, page 2].`);
});

test('maximum-size collection import commits in one transaction without per-record database queries',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id;
 const payload={schema:'evidarium.project.v1',
  sources:Array.from({length:1000},(_,i)=>({id:'source-'+i,title:'Distinct report '+i})),
  notes:Array.from({length:100},(_,i)=>({content:'Research note '+i})),
  messages:Array.from({length:500},(_,i)=>({role:'user',content:'Message '+i+' [S:source-'+i+'].'})),
  tasks:Array.from({length:100},(_,i)=>({id:'task-'+i,kind:'external_analysis',args:'{}',state:'completed',result:'{}'})),
  claims:Array.from({length:500},(_,i)=>({statement:'Claim '+i,quote:'Imported quotation '+i,source_id:'source-'+i})),
  audit:Array.from({length:1000},(_,i)=>({action:'external.event',detail:'Event '+i})),
 };
 const batches=[];let individualQueries=0;
 function wrap(statement){return {bind(...args){return wrap(statement.bind(...args));},all(...args){individualQueries++;return statement.all(...args);},first(...args){individualQueries++;return statement.first(...args);},run(...args){individualQueries++;return statement.run(...args);},underlying:statement};}
 const measuredDb={...f.db,prepare(sql){return wrap(f.db.prepare(sql));},batch(statements){batches.push(statements.length);return f.db.batch(statements.map(s=>s.underlying));}};
 const response=await f.call(prefix+'/import','POST',payload,'researcher',{db:measuredDb});
 assert.equal(response.status,200,await response.clone().text());
 const result=await response.json();assert.equal(result.added,1000);assert.match(result.scope,/Original files.*not restored/);
 assert.deepEqual(batches,[2202]);
 assert(individualQueries<=10,'Import made per-record queries: '+individualQueries);
 for(const [table,count] of [['sources',1000],['notes',100],['messages',500],['tasks',100],['claims',500]])assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM '+table+' WHERE project=?').get(f.project.id).n,count,table);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM tasks WHERE project=? AND state='imported'").get(f.project.id).n,100);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM claims WHERE project=? AND status='unreviewed'").get(f.project.id).n,500);
});

test('a database failure during manuscript save rolls back text, history and audit and permits a clean retry',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id;
 const draft=await(await f.call(prefix+'/manuscripts','POST',{title:'Protected draft'})).json();
 const before=await(await f.call(prefix)).json();
 const failingDb={...f.db,batch(statements){return f.db.batch([statements[0],f.db.prepare('INSERT INTO deliberately_missing_integrity_table VALUES (1)'),...statements.slice(1)]);}};
 const payload={title:draft.title,content:'This text must be saved as one complete revision.',revision:1};
 assert.equal((await f.call(prefix+'/manuscripts/'+draft.id,'PUT',payload,'researcher',{db:failingDb})).status,500);
 assert.deepEqual(await(await f.call(prefix)).json(),before);
 assert.equal(f.db.raw.prepare('SELECT count(*) n FROM manuscript_revisions WHERE document=?').get(draft.id).n,1);
 f.restart();
 assert.equal((await f.call(prefix+'/manuscripts/'+draft.id,'PUT',payload)).status,200);
 assert.equal((await(await f.call(prefix+'/manuscripts/'+draft.id)).json()).revision,2);
 assert.equal(f.db.raw.prepare('SELECT count(*) n FROM manuscript_revisions WHERE document=?').get(draft.id).n,2);
});

test('legacy screening, claim review and protocol edits roll back together with their audit entries',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id,quote='This exact evidence passage is long enough to inspect.';
 const [source]=await(await f.call(prefix+'/sources','POST',{title:'Protected evidence',abstract:quote})).json();
 const claim=await(await f.call(prefix+'/claims','POST',{statement:'A proposition for review',stance:'context',source_id:source.id,quote})).json();
 const cases=[['sources/'+source.id,{decision:'exclude',stage:'full_text',reason:'Outside the stated eligibility criteria'}],['claims/'+claim.id,{status:'accepted'}],[prefix,{question:'A revised question',criteria:'Revised eligibility',allow_search:false}]];
 for(const [route,payload] of cases){
  const before=await(await f.call(prefix)).json();
  const failingDb={...f.db,batch(statements){return f.db.batch([statements[0],f.db.prepare('INSERT INTO deliberately_missing_integrity_table VALUES(1)'),...statements.slice(1)]);}};
  assert.equal((await f.call(route,'PATCH',payload,'researcher',{db:failingDb})).status,500,route);
  assert.deepEqual(await(await f.call(prefix)).json(),before,route+' lost atomic history');
  assert.equal((await f.call(route,'PATCH',payload)).status,200,route+' failed clean retry');
 }
});

test('concurrent legacy edits cannot overwrite another committed decision or protocol without a conflict',async t=>{
 const f=await fixture(t),prefix='projects/'+f.project.id,quote='The same evidence can be reviewed by its project owner.';
 const [source]=await(await f.call(prefix+'/sources','POST',{title:'Concurrent evidence',abstract:quote})).json();
 const claim=await(await f.call(prefix+'/claims','POST',{statement:'A claim under review',stance:'context',source_id:source.id,quote})).json();
 const cases=[
  ['sources/'+source.id,[{decision:'include',stage:'full_text',reason:'Meets criteria'},{decision:'exclude',stage:'full_text',reason:'Does not meet criteria'}],'screening.decision'],
  ['claims/'+claim.id,[{status:'accepted'},{status:'rejected'}],'claim.reviewed'],
  [prefix,[{question:'First revised question'},{question:'Second revised question'}],'protocol.updated'],
 ];
 for(const [route,payloads,action] of cases){
  const count=()=>f.db.raw.prepare('SELECT COUNT(*) n FROM audit WHERE project=? AND action=?').get(f.project.id,action).n;
  const before=count();
  const responses=await Promise.all(payloads.map(payload=>f.call(route,'PATCH',payload)));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409],route);
  assert.equal(count(),before+1,route+' has an audit entry for a rejected change');
 }
});

test('failed deletion finalization retains an unavailable tombstone and resumes after a database restart',async t=>{
 const f=await fixture(t),file=await f.upload('delete-recovery.txt','Original content requested for deletion.');
 const failingDb={...f.db,batch(statements){return f.db.batch([statements[0],f.db.prepare('INSERT INTO deliberately_missing_integrity_table VALUES(1)'),...statements.slice(1)]);}};
 assert.equal((await f.call('files/'+file.id,'DELETE',undefined,'researcher',{db:failingDb})).status,503);
 const tombstone=f.db.raw.prepare('SELECT * FROM files WHERE id=?').get(file.id);
 assert.equal(tombstone.status,'deleting');assert.equal(await f.bucket.get(tombstone.key),null);
 assert.equal((await f.call('files/'+file.id)).status,409);
 assert.equal((await f.call('files/'+file.id+'/text')).status,409);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit WHERE project=? AND action='file.deleted'").get(f.project.id).n,0);
 f.restart();
 assert.equal((await f.call('files/'+file.id,'DELETE')).status,200);
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM files WHERE id=?').get(file.id).n,0);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit WHERE project=? AND action='file.deleted'").get(f.project.id).n,1);
});

test('ambiguous object-store deletion errors never resurrect originals and concurrent retries record one deletion',async t=>{
 const f=await fixture(t),file=await f.upload('ambiguous-delete.txt','The object store may have accepted a request before the connection fails.');
 const ambiguousBucket={...f.bucket,async delete(key){await f.bucket.delete(key);throw new Error('Connection lost after the object store accepted deletion');}};
 assert.equal((await f.call('files/'+file.id,'DELETE',undefined,'researcher',{bucket:ambiguousBucket})).status,503);
 assert.equal(f.db.raw.prepare('SELECT status FROM files WHERE id=?').get(file.id).status,'deleting');
 assert.equal((await f.call('files/'+file.id)).status,409);
 const retried=await Promise.all([f.call('files/'+file.id,'DELETE'),f.call('files/'+file.id,'DELETE')]);
 assert(retried.some(r=>r.status===200));assert(retried.every(r=>[200,404,409].includes(r.status)));
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM files WHERE id=?').get(file.id).n,0);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit WHERE project=? AND action='file.deleted'").get(f.project.id).n,1);
});
