import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApi} from '../lib/core.mjs';
import {emptyReview,reviewReadiness} from '../lib/review-model.mjs';
import {createDB,createBucket} from '../companion/storage.mjs';

const quote='At six months, 42 participants completed follow-up.';

test('relinking or deleting evidence between verification and commit cannot save a stale review',async t=>{
 const f=await setup(t),p=f.prefix.split('/')[1],batch=f.db.batch.bind(f.db),[other]=await(await f.call(f.prefix+'/sources','POST',{title:'Other report',abstract:quote})).json();
 f.db.raw.prepare('INSERT INTO files(id,project,name,mime,size,key,status,extracted,sha256,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run('race-file',p,'report.txt','text/plain',quote.length,'test/file','extracted',JSON.stringify({segments:[{location:'text',text:quote}]}),'a'.repeat(64),1);f.data.extractions[0].fileId='race-file';f.data.extractions[0].location='text';
 for(const mutation of ['relink','delete']){
  f.db.raw.prepare("UPDATE files SET status='extracted',source_id=NULL WHERE id='race-file'").run();let injected=false;f.db.batch=async statements=>{if(!injected){injected=true;if(mutation==='relink')f.db.raw.prepare("UPDATE files SET source_id=?,link_revision=link_revision+1 WHERE id='race-file'").run(other.id);else f.db.raw.prepare("UPDATE files SET status='deleting' WHERE id='race-file'").run();}return batch(statements)};
  assert.equal((await f.save(f.data)).status,409);assert.equal(f.db.raw.prepare('SELECT count(*) n FROM review_workspaces').get().n,0);assert.equal(f.db.raw.prepare('SELECT count(*) n FROM review_revisions').get().n,0);
 }
});
async function setup(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-review-')),db=createDB(path.join(root,'db'),fileURLToPath(new URL('../drizzle',import.meta.url))),bucket=createBucket(path.join(root,'files'));
 t.after(async()=>{db.close();await rm(root,{recursive:true,force:true})});
 const call=(route,method='GET',body,owner='alice',headers={})=>handleApi(new Request('https://test.invalid/api/'+route,{method,headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{db,bucket,user:owner?{userId:owner}:null,local:true});
 const p=await(await call('projects','POST',{title:'مراجعة منهجية'})).json(),prefix='projects/'+p.id;
 const [source]=await(await call(prefix+'/sources','POST',{title:'Follow-up report',abstract:quote,origin:'fixture'})).json();
 const data=emptyReview();data.protocol.question='ما أثر التدخل؟';data.studies=[{id:'study-a',label:'Trial A',design:'randomized trial',notes:'Trial registry identifier manually checked',sourceIds:[source.id]}];
 data.extractions=[{id:'entry-a',studyId:'study-a',sourceId:source.id,fileId:'',location:'abstract',field:'Participants completing follow-up',value:'42',unit:'participants',timepoint:'6 months',quote,reviewStatus:'unchecked'}];
 const save=(data,revision=0,reason='Initial extraction')=>call(prefix+'/review','PUT',{data,revision,reason});
 return {call,prefix,source,data,db,save};
}
test('Arabic protocol and study-linked extraction persist with evidence hash and revision reason',async t=>{
 const {call,prefix,data,save}=await setup(t);assert.equal((await(await call(prefix+'/review')).json()).revision,0);
 const r=await save(data);assert.equal(r.status,200);const out=await r.json();assert.equal(out.revision,1);assert.equal(out.data.protocol.question,'ما أثر التدخل؟');assert.match(out.data.extractions[0].verification.evidence_sha256,/^[a-f0-9]{64}$/);assert.equal(out.data.extractions[0].reviewedBy,null);
 const saved=await(await call(prefix+'/review')).json();assert.equal(saved.readiness.studyCount,1);assert.equal(saved.readiness.unreviewedExtractions,1);const h=await(await call(prefix+'/review/history/1')).json();assert.equal(h.reason,'Initial extraction');assert.equal(h.actor,'alice');assert.match(h.sha256,/^[a-f0-9]{64}$/);
});
test('fabricated quotations, missing reasons and foreign reports fail without writes',async t=>{
 const {call,prefix,data,save,db}=await setup(t);assert.equal((await save(data,0,'')).status,400);
 const changed=structuredClone(data);changed.extractions[0].quote='This was never in the source.';assert.equal((await save(changed)).status,400);
 const other=await(await call('projects','POST',{title:'Other'})).json();const [s]=await(await call('projects/'+other.id+'/sources','POST',{title:'Other report',abstract:quote})).json();changed.extractions[0].quote=quote;changed.studies[0].sourceIds=[s.id];changed.extractions[0].sourceId=s.id;assert.equal((await save(changed)).status,400);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM review_workspaces').get().n,0);assert.equal((await(await call(prefix+'/review/history')).json()).length,0);
});
test('owner checks and origin checks protect every review route',async t=>{
 const {call,prefix,data}=await setup(t);
 for(const route of ['review','review/export','review/history','review/history/1']){assert.equal((await call(prefix+'/'+route,'GET',undefined,'bob')).status,404);assert.equal((await call(prefix+'/'+route,'GET',undefined,null)).status,401);}
 assert.equal((await call(prefix+'/review','PUT',{data,revision:0,reason:'write'},'bob')).status,404);
 assert.equal((await call(prefix+'/review','PUT',{data,revision:0,reason:'write'},'alice',{origin:'https://foreign.invalid'})).status,403);
});
test('one report cannot inflate counts by being linked to two studies',async t=>{
 const {data,save}=await setup(t);data.studies.push({...data.studies[0],id:'study-b'});assert.equal((await save(data)).status,400);
});
test('concurrent first saves and later saves accept only one complete revision',async t=>{
 const {call,prefix,data,save,db}=await setup(t);
 assert.deepEqual((await Promise.all([save(data),save(data)])).map(r=>r.status).sort(),[200,409]);
 assert.deepEqual((await Promise.all([save(data,1,'one'),save(data,1,'two')])).map(r=>r.status).sort(),[200,409]);
 assert.equal((await(await call(prefix+'/review')).json()).revision,2);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM review_revisions').get().n,2);assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM audit WHERE action='review.saved'").get().n,2);
});
test('checked data cannot silently retain review when values or source text change',async t=>{
 const {data,save,db,source}=await setup(t);let saved=await(await save(data)).json();saved.data.extractions[0].reviewStatus='checked';saved=await(await save(saved.data,1,'Owner checked')).json();assert.equal(saved.data.extractions[0].reviewedBy,'alice');
 saved.data.extractions[0].value='43';assert.equal((await save(saved.data,2,'Changed value')).status,400);saved.data.extractions[0].reviewStatus='unchecked';saved=await(await save(saved.data,2,'Correct value')).json();assert.equal(saved.data.extractions[0].reviewedBy,null);
 saved.data.extractions[0].reviewStatus='checked';saved=await(await save(saved.data,3,'Check again')).json();db.raw.prepare('UPDATE sources SET abstract=? WHERE id=?').run('Correction: '+quote,source.id);assert.equal((await save(saved.data,4,'Updated protocol')).status,400);
});
test('file quotations check the exact segment and cannot cross report or project boundaries',async t=>{
 const {call,prefix,data,save,db,source}=await setup(t);const p=prefix.split('/')[1];
 db.raw.prepare('INSERT INTO files(id,project,name,mime,size,key,status,extracted,source_id,sha256,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('file-a',p,'report.txt','text/plain',quote.length,'test/file','extracted',JSON.stringify({segments:[{location:'page 2',text:quote}]}),source.id,'hash',1);
 data.extractions[0].fileId='file-a';data.extractions[0].location='page 1';assert.equal((await save(data)).status,400);data.extractions[0].location='page 2';const out=await(await save(data)).json();assert.equal(out.data.extractions[0].verification.file_sha256,'hash');
 db.raw.prepare('UPDATE files SET source_id=? WHERE id=?').run('different-source','file-a');assert.equal((await save(out.data,1,'Change')).status,400);
});
test('project export/import retains Arabic and associations but resets claimed verification',async t=>{
 const {call,prefix,data,save}=await setup(t);data.extractions[0].reviewStatus='checked';await save(data);const exported=await(await call(prefix+'/export')).json();assert.equal(exported.review_workspace.revision,1);
 const p=await(await call('projects','POST',{title:'Restored'})).json(),newPrefix='projects/'+p.id;const imported=await call(newPrefix+'/import','POST',exported);assert.equal(imported.status,200,await imported.clone().text());
 const restored=await(await call(newPrefix+'/review')).json();assert.equal(restored.data.protocol.question,'ما أثر التدخل؟');assert.notEqual(restored.data.studies[0].sourceIds[0],data.studies[0].sourceIds[0]);const entry=restored.data.extractions[0];assert.equal(entry.studyId,restored.data.studies[0].id);assert.equal(entry.sourceId,restored.data.studies[0].sourceIds[0]);assert.equal(entry.reviewStatus,'unchecked');assert.equal(entry.verification.method,'external import; not rechecked');
 restored.data.protocol.synthesis='Updated plan';assert.equal((await call(newPrefix+'/review','PUT',{data:restored.data,revision:1,reason:'Plan update'})).status,200);
 assert.equal((await call(newPrefix+'/import','POST',exported)).status,409);
});
test('readiness counts missing inputs, not study quality, and exports protect spreadsheet cells',async t=>{
 const {call,prefix,data,save}=await setup(t);data.extractions[0].value='=HYPERLINK("https://invalid")';await save(data);const csv=await(await call(prefix+'/review/export?format=csv')).text();assert.match(csv,/'=HYPERLINK/);assert.match(csv,/scientific validity|study quality/);const review=await(await call(prefix+'/review/export')).json();assert.equal(review.history.length,1);assert.match(review.notice,/not independent dual review/);const check=reviewReadiness(data,[{id:'unknown'}]);assert.equal(check.unlinkedRecords,1);assert.equal(check.missingProtocolFields.length,13);
});
test('retained history is bounded and old revisions are readable only inside their project',async t=>{
 const {call,prefix,data,save}=await setup(t);for(let revision=0;revision<32;revision++)assert.equal((await save(data,revision,'Revision '+revision)).status,200);
 const h=await(await call(prefix+'/review/history')).json();assert.equal(h.length,30);assert.equal(h.at(-1).revision,3);assert.equal((await call(prefix+'/review/history/1')).status,404);
});
