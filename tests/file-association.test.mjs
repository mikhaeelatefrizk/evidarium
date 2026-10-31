import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {handleApi} from '../lib/core.mjs';
import {createDB,createBucket} from '../companion/storage.mjs';

async function setup(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-link-')),db=createDB(path.join(root,'db'),fileURLToPath(new URL('../drizzle',import.meta.url))),bucket=createBucket(path.join(root,'files'));
 t.after(async()=>{db.close();await rm(root,{recursive:true,force:true})});
 const call=(route,method='GET',body,actor='alice')=>handleApi(new Request('https://example.invalid/api/'+route,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),{db,bucket,user:actor?{userId:actor,email:actor+'@example.org'}:null});
 const p=await(await call('projects','POST',{title:'Original association',criteria:'Controlled trials'})).json(),[source]=await(await call('projects/'+p.id+'/sources','POST',{title:'Original report'})).json();
 async function upload(name='original.txt'){
  const bytes=Buffer.from('The original study reports forty-two participants.'),f=await(await call('projects/'+p.id+'/files','POST',{name,size:bytes.length})).json();
  await handleApi(new Request('https://example.invalid/api/files/'+f.id+'/part?n=1',{method:'PUT',headers:{'x-part-sha256':createHash('sha256').update(bytes).digest('hex')},body:bytes}),{db,bucket,user:{userId:'alice'}});
  assert.equal((await call('files/'+f.id+'/complete','POST',{})).status,200);
  const task=await(await call('tasks','POST',{project:p.id,kind:'web_extract_text',args:{file_id:f.id}})).json();assert.equal((await(await call('tasks/'+task.id+'/approve','POST',{})).json()).state,'completed');return f;
 }
 const file=await upload(),route='files/'+file.id+'/association',view=()=>call(route).then(r=>r.json()),link=async(sourceId=source.id,overrides={})=>call(route,'PUT',{...await view(),sourceId,reason:'Checked the report against this original',...overrides});
 return {db,bucket,call,p,source,file,route,view,link,upload};
}
test('real uploaded and extracted original can be linked and unlinked with a durable reason and revision',async t=>{
 const f=await setup(t);assert.equal((await f.view()).revision,0);const r=await f.link();assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).sourceId,f.source.id);assert.equal((await f.view()).revision,1);
 assert.equal((await f.link(null)).status,200);assert.equal((await f.view()).revision,2);assert.equal(f.db.raw.prepare("SELECT count(*) n FROM audit WHERE action='file.report_associated'").get().n,2);
});
test('association is owner-only even after accepting independent-review membership',async t=>{
 const f=await setup(t),base='screening/projects/'+f.p.id;const inv=await(await f.call(base+'/invitations','POST',{email:'bob@example.org'})).json();assert.equal((await f.call('screening/invitations/accept','POST',{token:inv.token},'bob')).status,200);
 for(const actor of ['bob','eve',null])for(const method of ['GET','PUT'])assert.equal((await f.call(f.route,method,method==='PUT'?{sourceId:f.source.id,revision:0,sha256:(await f.view()).sha256,reason:'Attempt'}:undefined,actor)).status,actor?404:401);
 assert.equal((await f.view()).sourceId,null);
});
test('cross-project reports, changed checksum, stale revision and unfinished file states cannot be linked',async t=>{
 const f=await setup(t),p2=await(await f.call('projects','POST',{title:'Other'})).json(),[s2]=await(await f.call('projects/'+p2.id+'/sources','POST',{title:'Other report'})).json();
 assert.equal((await f.link(s2.id)).status,404);assert.equal((await f.link(f.source.id,{sha256:'0'.repeat(64)})).status,409);assert.equal((await f.link(f.source.id,{revision:4})).status,409);
 for(const status of ['uploading','completing','deleting']){f.db.raw.prepare('UPDATE files SET status=? WHERE id=?').run(status,f.file.id);assert.equal((await f.call(f.route,'PUT',{sourceId:f.source.id,revision:0,sha256:'a'.repeat(64),reason:'Attempt'})).status,409);}
 assert.equal(f.db.raw.prepare('SELECT source_id FROM files WHERE id=?').get(f.file.id).source_id,null);
});
test('a report has one original and concurrent duplicate links create exactly one association event',async t=>{
 const f=await setup(t),initial=await f.view(),body={...initial,sourceId:f.source.id,reason:'Original association'};
 const results=await Promise.all([f.call(f.route,'PUT',body),f.call(f.route,'PUT',body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(f.db.raw.prepare("SELECT count(*) n FROM audit WHERE action='file.report_associated'").get().n,1);
 const second=await f.upload('second.txt'),v=await(await f.call('files/'+second.id+'/association')).json();assert.equal((await f.call('files/'+second.id+'/association','PUT',{...v,sourceId:f.source.id,reason:'Attempt second original'})).status,409);
});
test('assigned full-text evidence remains immutable through cancellation and attempted relinking',async t=>{
 const f=await setup(t);await f.link();const base='screening/projects/'+f.p.id,inv=await(await f.call(base+'/invitations','POST',{email:'bob@example.org'})).json();await f.call('screening/invitations/accept','POST',{token:inv.token},'bob');
 const response=await f.call(base+'/rounds','POST',{sourceId:f.source.id,stage:'full_text',reviewerIds:['alice','bob'],reason:'Read linked original'});assert.equal(response.status,201,await response.clone().text());const round=await response.json(),snapshot=f.db.raw.prepare('SELECT snapshot,snapshot_hash FROM screening_rounds WHERE id=?').get(round.id);
 assert.equal((await f.link(null)).status,409);assert.equal((await f.view()).locked,true);await f.call(base+'/rounds/'+round.id+'/cancel','POST',{revision:round.revision,reason:'Correction needed'});assert.equal((await f.link(null)).status,409);
 assert.deepEqual(f.db.raw.prepare('SELECT snapshot,snapshot_hash FROM screening_rounds WHERE id=?').get(round.id),snapshot);
});
test('retained extraction history also freezes a formerly unlinked original',async t=>{
 const f=await setup(t),data=JSON.stringify({extractions:[{fileId:f.file.id}]});f.db.raw.prepare('INSERT INTO review_revisions(project,revision,data,reason,actor,sha256,created) VALUES(?,?,?,?,?,?,?)').run(f.p.id,1,data,'Historical use','alice','h',1);
 assert.equal((await f.link()).status,409);assert.equal((await f.view()).sourceId,null);
});
test('association and event roll back together if the audit write fails',async t=>{
 const f=await setup(t);f.db.raw.exec("CREATE TRIGGER reject_association BEFORE INSERT ON audit WHEN NEW.action='file.report_associated' BEGIN SELECT RAISE(ABORT,'injected failure'); END");assert.equal((await f.link()).status,500);const current=await f.view();assert.equal(current.sourceId,null);assert.equal(current.revision,0);
});
