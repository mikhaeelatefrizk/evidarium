/** Explicit integration suite: requires real ASReview, INDRA and R/metafor installations. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {createApplication} from '../../companion/server.mjs';
async function fixture(t){
 assert(process.env.EVIDARIUM_TEST_PYTHON,'Set EVIDARIUM_TEST_PYTHON to the installed integration environment.');
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-engines-'));
 const app=createApplication({dataRoot:root,python:process.env.EVIDARIUM_TEST_PYTHON});
 t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true})});
 const call=async(route,body)=>{const r=await app.handle(new Request('http://127.0.0.1/api/'+route,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}));const d=await r.json();assert(r.ok,JSON.stringify(d));return d};
 const p=await call('projects',{title:'Disposable scientific integration test'});
 async function execute(kind,args){
  const task=await call('tasks',{project:p.id,kind,args});assert.equal(task.state,'awaiting_approval');
  await call(`tasks/${task.id}/approve`,{});const deadline=Date.now()+120000;
  while(Date.now()<deadline){const data=await call('projects/'+p.id),row=data.tasks.find(x=>x.id===task.id);if(!['running','queued'].includes(row.state)){assert.equal(row.state,'completed',row.error);return JSON.parse(row.result)}await new Promise(r=>setTimeout(r,50))}
  throw Error('The real engine did not finish within 120 seconds.');
 }
 async function upload(name,text){const bytes=Buffer.from(text),f=await call('projects/'+p.id+'/files',{name,mime:'text/csv',size:bytes.length});const r=await app.handle(new Request(`http://127.0.0.1/api/files/${f.id}/part?n=1`,{method:'PUT',body:bytes,headers:{'x-part-sha256':createHash('sha256').update(bytes).digest('hex')}}));assert(r.ok);await call(`files/${f.id}/complete`,{});return f.id}
 const patch=async(route,body)=>{const r=await app.handle(new Request('http://127.0.0.1/api/'+route,{method:'PATCH',body:JSON.stringify(body)}));const d=await r.json();assert(r.ok,JSON.stringify(d));return d};
 return {call,p,execute,upload,patch};
}
test('real R/metafor: uploaded BCG data, human approval, reference result and exported provenance',{timeout:150000},async t=>{
 const f=await fixture(t),raw=await readFile(new URL('../fixtures/bcg.csv',import.meta.url),'utf8');
 const rows=raw.trim().split(/\r?\n/).slice(1).map(line=>line.split(',').map(Number));
 const csv='yi,vi\n'+rows.map(([,a,b,c,d])=>`${Math.log((a/(a+b))/(c/(c+d)))},${1/a-1/(a+b)+1/c-1/(c+d)}`).join('\n');
 const file=await f.upload('bcg-effects.csv',csv),out=await f.execute('meta_analysis',{file_id:file,effect:'yi',variance:'vi',independent_effects_confirmed:true});
 for(const [key,expected] of Object.entries({estimate:-.7145,se:.1808,tau2:.3132,ci_lower:-1.1084,ci_upper:-.3206}))assert(Math.abs(out.result[key]-expected)<.00006,`${key}: ${out.result[key]}`);
 assert.equal(out.result.k,13);assert.match(out.provenance.input_sha256,/^[a-f0-9]{64}$/);
 const exported=await f.call(`projects/${f.p.id}/export`);assert(exported.tasks.some(t=>t.state==='completed'));assert(exported.audit.some(x=>x.action==='task.approved'));
});
test('real ASReview fits labels and ranks every unreviewed candidate without changing decisions',{timeout:150000},async t=>{
 const f=await fixture(t);
 for(const [title,decision] of [['Cancer treatment trial','include'],['Plant root growth','exclude'],['Cancer survival therapy','unknown'],['Forest vegetation soil','unknown']]){
  const [s]=await f.call(`projects/${f.p.id}/sources`,{title,abstract:''});
  if(decision!=='unknown'){
   const r=await f.call('projects/'+f.p.id); // Actual project records, not mocked model output.
   const id=r.sources.find(x=>x.id===s.id).id;
   // Use the same HTTP update path as the review interface.
   const response=await fetchPatch(f,id,decision);assert(response);
  }
 }
 const before=(await f.call('projects/'+f.p.id)).sources;
 const out=await f.execute('screen_rank',{stage:'title_abstract'});
 assert.equal(out.result.priority_order.length,2);assert.equal(out.result.training_records,2);
 assert.deepEqual((await f.call('projects/'+f.p.id)).sources.map(s=>[s.id,s.decision]),before.map(s=>[s.id,s.decision]));
});
async function fetchPatch(f,id,decision){return f.patch(`sources/${id}`,{decision,stage:'title_abstract',reason:decision==='exclude'?'Synthetic fixture exclusion':''})}
test('real INDRA preserves distinct grounded agents and evidence',{timeout:150000},async t=>{
 const f=await fixture(t),out=await f.execute('mechanism_graph',{statements:[{type:'Activation',subj:{name:'same-name',db_refs:{HGNC:'1097'}},obj:{name:'same-name',db_refs:{HGNC:'6840'}},evidence:[{source_api:'synthetic-fixture',text:'Synthetic verification only, not an experimentally validated claim.'}]}]});
 assert.equal(out.result.nodes.length,2);assert.notEqual(...out.result.claims[0].agent_ids);assert.equal(out.result.claims[0].evidence[0].source_api,'synthetic-fixture');
});
