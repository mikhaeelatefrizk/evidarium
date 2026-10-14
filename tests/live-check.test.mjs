import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {verifyLive} from '../lib/live-check.mjs';import {createApplication,pythonWorker} from '../companion/server.mjs';
test('live verification refuses hosted execution before creating data or requesting inference',async()=>{
 let calls=0;const report=await verifyLive({model:'controlled-model',fetcher:async()=>{calls++;return Response.json({local:false})}});
 assert.equal(report.status,'failed');assert.equal(calls,1);assert.equal(report.checks.length,0);
});
test('acceptance runner exercises real files, approved workers and export with a controlled model, not live OAuth',{skip:!process.env.EVIDARIUM_TEST_PYTHON,timeout:30000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-live-check-test-'));
 const app=createApplication({dataRoot:root,python:process.env.EVIDARIUM_TEST_PYTHON,worker:options=>{
  if(options.payload.command==='status')return {cancel(){},promise:Promise.resolve({connected:true,models:[{slug:'controlled-model'}]})};
  if(options.payload.command==='chat')return {cancel(){},promise:Promise.resolve().then(async()=>{const row=app.db.raw.prepare("SELECT id FROM files WHERE name='reference.txt'").get();await options.onEvent({event:'delta',text:`The reference values are 2, 4, and 6. Their arithmetic mean is 4. [F:${row.id}, text]`});return {model:'controlled-model',rounds:1,usage:[]}})};
  return pythonWorker(options);
 }});t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true})});
 const report=await verifyLive({origin:'http://127.0.0.1',model:'controlled-model',fetcher:(url,options)=>app.handle(new Request(url,options))});
 assert.equal(report.status,'passed',report.error);assert.equal(report.checks.length,6);assert(report.project_id);
 assert.equal(app.db.raw.prepare("SELECT count(*) AS n FROM tasks WHERE kind='chat' AND state='completed'").get().n,2);
});
