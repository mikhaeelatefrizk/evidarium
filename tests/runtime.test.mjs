import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {enginePython} from '../companion/engine-runtime.mjs';
test('engine interpreters are isolated and invalid configurations fail without fallback',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'evidarium-env-'));t.after(()=>rm(root,{recursive:true,force:true}));
 assert.equal(enginePython(root,'screen_rank','base-python'),'base-python');
 await writeFile(path.join(root,'engine-runtimes.json'),JSON.stringify({screen_rank:{python:process.execPath}}));
 assert.equal(enginePython(root,'screen_rank','base-python'),process.execPath);
 assert.equal(enginePython(root,'describe_csv','base-python'),'base-python');
 await writeFile(path.join(root,'engine-runtimes.json'),JSON.stringify({screen_rank:{python:'relative-command'}}));
 assert.throws(()=>enginePython(root,'screen_rank','base-python'),/unavailable/);
});
