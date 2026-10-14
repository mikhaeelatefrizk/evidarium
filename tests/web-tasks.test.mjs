import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {handleApi} from '../lib/core.mjs';import {createDB,createBucket} from '../companion/storage.mjs';
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-web-')),db=createDB(path.join(root,'db.sqlite'),fileURLToPath(new URL('../drizzle',import.meta.url))),bucket=createBucket(path.join(root,'files'));
 t.after(async()=>{db.close();await rm(root,{recursive:true,force:true})});
 const call=(route,method='GET',value,owner='alice',headers={})=>handleApi(new Request('https://test.invalid/api/'+route,{method,headers:{'content-type':'application/json',...headers},...(value!==undefined?{body:JSON.stringify(value)}:{})}),{db,bucket,user:owner?{userId:owner}:null});
 const project=await(await call('projects','POST',{title:'Native website verification'})).json();
 async function upload(name,text){const bytes=Buffer.from(text),file=await(await call(`projects/${project.id}/files`,'POST',{name,size:bytes.length})).json();
  const res=await handleApi(new Request(`https://test.invalid/api/files/${file.id}/part?n=1`,{method:'PUT',body:bytes,headers:{'x-part-sha256':createHash('sha256').update(bytes).digest('hex')}}),{db,bucket,user:{userId:'alice'}});assert.equal(res.status,200);assert.equal((await call(`files/${file.id}/complete`,'POST',{})).status,200);return file;
 }
 return {root,db,bucket,call,project,upload};
}
test('public reference check computes actual fixed results without accessing private records',async t=>{
 const {call}=await fixture(t),r=await call('science-check','GET',undefined,null);assert.equal(r.status,200);const report=await r.json();assert.equal(report.status,'passed');assert.equal(report.execution,'hosted_native');assert.equal(report.checks.length,3);assert.equal(report.checks[0].actual.mean,4);assert(report.checks[1].absolute_errors.tau2<1e-6);assert.equal(report.checks[2].passed,true);
});
test('hosted CSV upload → preparation → approval → actual calculation → export retains fingerprint and audit',async t=>{
 const {call,project,upload}=await fixture(t),file=await upload('numbers.csv','value\n2\n4\n6\n');
 const proposed=await(await call('tasks','POST',{project:project.id,kind:'web_describe_csv',args:{file_id:file.id}})).json();assert.equal(proposed.state,'awaiting_approval');assert.equal(proposed.parameters.execution,'hosted_native');
 assert.equal((await call(`tasks/${proposed.id}/approve`,'POST',{},'bob')).status,404);assert.equal((await call(`tasks/${proposed.id}/approve`,'POST',{},'alice',{origin:'https://evil.invalid'})).status,403);
 const results=await Promise.all([call(`tasks/${proposed.id}/approve`,'POST',{}),call(`tasks/${proposed.id}/approve`,'POST',{})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const data=await(await call(`projects/${project.id}/export`)).json(),task=data.tasks[0],result=JSON.parse(task.result);assert.equal(task.state,'completed');assert.equal(result.result.columns.value.mean,4);assert.equal(result.result.columns.value.sd,2);assert.equal(result.provenance.input_sha256,proposed.parameters.input_sha256);assert.equal(result.provenance.execution,'hosted_native');
 assert.equal(data.audit.filter(e=>e.action==='task.approved').length,1);assert.equal(data.audit.filter(e=>e.action==='task.completed').length,1);
});
test('website extraction enables real evidence receipts and project retrieval',async t=>{
 const {call,project,upload}=await fixture(t),file=await upload('reference.txt','The controlled fixture contains a measured mean of four.');
 const task=await(await call('tasks','POST',{project:project.id,kind:'web_extract_text',args:{file_id:file.id}})).json();await call(`tasks/${task.id}/approve`,'POST',{});
 assert.equal((await(await call(`files/${file.id}/text`)).json()).complete,true);
 const receipt=await call(`projects/${project.id}/claims`,'POST',{statement:'Fixture mean',stance:'supports',file_id:file.id,location:'text',quote:'a measured mean of four'});assert.equal(receipt.status,201);assert.equal((await receipt.json()).interpretationVerified,false);
 const matches=await(await call(`projects/${project.id}/retrieve?q=measured&kind=file`)).json();assert.equal(matches.results[0].id,file.id);
});
test('hosted PDF approval stores real page text for exact-passage evidence',async t=>{
 const {call,project,upload}=await fixture(t),bytes=Buffer.from(await readFile(new URL('./fixtures/pdf-text.b64',import.meta.url),'utf8'),'base64'),file=await upload('reference.pdf',bytes);
 const task=await(await call('tasks','POST',{project:project.id,kind:'web_extract_pdf',args:{file_id:file.id}})).json();assert.equal((await(await call(`tasks/${task.id}/approve`,'POST',{})).json()).state,'completed');
 const extraction=await(await call(`files/${file.id}/text`)).json();assert.equal(extraction.total_pages,2);assert.equal(extraction.complete,true);
 const receipt=await call(`projects/${project.id}/claims`,'POST',{statement:'Fixture mean',stance:'supports',file_id:file.id,location:'page 2',quote:'a mean of four'});assert.equal(receipt.status,201);
});
test('invalid calculations fail honestly; unsupported engines cannot execute remotely',async t=>{
 const {call,project,upload}=await fixture(t),file=await upload('bad.csv','x,x\n1,2\n');
 const task=await(await call('tasks','POST',{project:project.id,kind:'web_describe_csv',args:{file_id:file.id}})).json();assert.equal((await(await call(`tasks/${task.id}/approve`,'POST',{})).json()).state,'failed');
 const data=await(await call(`projects/${project.id}`)).json();assert.equal(data.tasks[0].result,null);assert.match(data.tasks[0].error,/unique/);assert.equal(data.audit.some(x=>x.action==='task.completed'),false);
 assert.equal((await call('tasks','POST',{project:project.id,kind:'python',args:{file_id:file.id,code:'print(1)'}})).status,400);
 assert.equal((await call('tasks','POST',{project:project.id,kind:'web_describe_csv',args:{file_id:file.id}},'bob')).status,404);assert.equal((await call('tasks','POST',{},null)).status,401);
});
test('changed inputs, stale engine versions, and cancelled proposals cannot execute',async t=>{
 const {call,project,upload,db,bucket}=await fixture(t),file=await upload('values.csv','x\n1\n2\n');
 const prepare=async()=>await(await call('tasks','POST',{project:project.id,kind:'web_describe_csv',args:{file_id:file.id}})).json();
 const cancelled=await prepare();await call(`tasks/${cancelled.id}/cancel`,'POST',{});assert.equal((await call(`tasks/${cancelled.id}/approve`,'POST',{})).status,409);
 const stale=await prepare(),args=JSON.parse(db.raw.prepare('SELECT args FROM tasks WHERE id=?').get(stale.id).args);args.engine_version='old';db.raw.prepare('UPDATE tasks SET args=? WHERE id=?').run(JSON.stringify(args),stale.id);assert.equal((await call(`tasks/${stale.id}/approve`,'POST',{})).status,409);
 const changed=await prepare(),stored=db.raw.prepare('SELECT * FROM files WHERE id=?').get(file.id);await bucket.put(stored.key,Buffer.from('x\n3\n4\n'));const r=await call(`tasks/${changed.id}/approve`,'POST',{});assert.equal(r.status,409);assert.match((await r.json()).error,/changed/);
});
test('website meta-analysis executes and retains every study, with assumptions required',async t=>{
 const {call,project,upload}=await fixture(t),file=await upload('effects.csv','study,yi,vi\na,.1,.2\nb,.2,.2\nc,.3,.2\n');
 const args={file_id:file.id,effect:'yi',variance:'vi',label:'study'};assert.equal((await call('tasks','POST',{project:project.id,kind:'web_meta_analysis',args})).status,400);
 const task=await(await call('tasks','POST',{project:project.id,kind:'web_meta_analysis',args:{...args,independent_effects_confirmed:true}})).json();assert.equal((await(await call(`tasks/${task.id}/approve`,'POST',{})).json()).state,'completed');
 const data=await(await call(`projects/${project.id}/export`)).json(),r=JSON.parse(data.tasks[0].result).result;assert(Math.abs(r.estimate-.2)<1e-12);assert.equal(r.tau2,0);assert.deepEqual(r.studies.map(s=>s.label),['a','b','c']);
});
