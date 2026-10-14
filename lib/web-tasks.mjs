import {AppError,all,first,run,audit,json,uid,now,projectFor} from './core.mjs';
import {WEB_KINDS,WEB_LIMITS,WEB_SCIENCE_VERSION,validateWebParameters,runWebScience} from './web-science.mjs';
export {WEB_KINDS};
async function inputBytes(bucket,file,kind){
 const limit=kind==='web_extract_pdf'?WEB_LIMITS.pdfBytes:WEB_LIMITS.bytes;
 if(file.size>limit)throw new AppError(`This website analysis accepts files up to ${limit/1024**2} MiB; larger originals remain stored.`,413);
 const object=await bucket.get(file.key);if(!object)throw new AppError('Input bytes are unavailable.',404);
 const reader=object.body.getReader(),chunks=[];let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new AppError('Input exceeds the website analysis limit.',413)}chunks.push(value)}}finally{reader.releaseLock()}
 if(length!==file.size)throw new AppError('Stored input length does not match its record.',409);
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');return {bytes,sha256};
}
async function inputFile(db,project,id){const f=await first(db,'SELECT * FROM files WHERE id=? AND project=?',id,project);if(!f||f.status==='uploading')throw new AppError('Choose a completed input file in this project.',404);return f}
export async function handleWebTasks(req,{db,bucket,user,local=false,readBody}){
 const parts=new URL(req.url).pathname.replace(/^\/api\/?/,'').split('/'),owner=user.userId;
 if(parts.length===1&&req.method==='POST'){
  const body=await readBody(),p=await projectFor(db,body.project,owner);let parameters;
  try{parameters=validateWebParameters(body.kind,body.args)}catch(e){throw new AppError(e.message)}
  const pending=await first(db,"SELECT count(*) AS n FROM tasks WHERE project=? AND state='awaiting_approval'",p.id);if(pending.n>=100)throw new AppError('Review or cancel existing proposals before adding more.',409);
  const f=await inputFile(db,p.id,parameters.file_id),input=await inputBytes(bucket,f,body.kind);
  const args={...parameters,input_sha256:input.sha256,file_name:f.name,execution:local?'local_native':'hosted_native',engine_version:WEB_SCIENCE_VERSION};
  const id=uid();await run(db,'INSERT INTO tasks (id,project,kind,args,state,created,updated) VALUES (?,?,?,?,?,?,?)',id,p.id,body.kind,JSON.stringify(args),'awaiting_approval',now(),now());
  await audit(db,p.id,'task.proposed',{taskId:id,kind:body.kind,parameters:args,origin:'human',network:'No external inference or analysis service'});return json({id,state:'awaiting_approval',kind:body.kind,parameters:args},201);
 }
 if(parts.length!==3||req.method!=='POST'||!['approve','cancel'].includes(parts[2]))throw new AppError('Endpoint not found.',404);
 const task=await first(db,'SELECT * FROM tasks WHERE id=?',parts[1]);if(!task)throw new AppError('Task not found.',404);await projectFor(db,task.project,owner);
 if(!WEB_KINDS.includes(task.kind))throw new AppError('This task requires its original execution environment.',409);
 if(parts[2]==='cancel'){
  const result=await run(db,"UPDATE tasks SET state='cancelled',updated=? WHERE id=? AND state IN ('awaiting_approval','running')",now(),task.id);if(!result.meta.changes)throw new AppError('This task has already ended.',409);
  await audit(db,task.project,'task.cancelled',{taskId:task.id});return json({id:task.id,state:'cancelled'});
 }
 if(task.state!=='awaiting_approval')throw new AppError('Only a pending task can be approved. Inspect the existing result before retrying.',409);
 const args=JSON.parse(task.args);if(args.engine_version!==WEB_SCIENCE_VERSION)throw new AppError('The analysis engine changed. Prepare a new task to approve the current version.',409);
 const f=await inputFile(db,task.project,args.file_id),input=await inputBytes(bucket,f,task.kind);
 if(input.sha256!==args.input_sha256)throw new AppError('The input changed after preparation. Prepare a new task.',409);
 const started=now(),claimed=await run(db,"UPDATE tasks SET state='running',updated=? WHERE id=? AND state='awaiting_approval'",started,task.id);if(!claimed.meta.changes)throw new AppError('This task was already approved or cancelled.',409);
 try{
  await audit(db,task.project,'task.approved',{taskId:task.id,parameters:args,execution:args.execution,reviewer:owner});
  const result=task.kind==='web_extract_pdf'?await (await import('./web-pdf.mjs')).extractWebsitePdf(input.bytes,f.name):runWebScience(task.kind,args,input.bytes,f.name),finished=now(),provenance={engine:task.kind==='web_extract_pdf'?result.method:'Evidarium native JavaScript',engine_version:WEB_SCIENCE_VERSION,...(task.kind==='web_meta_analysis'?{distribution_library:'jStat 1.9.6'}:{}),execution:local?'local_native':'hosted_native',input_sha256:input.sha256,input_name:f.name,input_bytes:input.bytes.length,parameters:args,started_at:new Date(started).toISOString(),completed_at:new Date(finished).toISOString(),elapsed_ms:finished-started,verification:'Execution and fingerprints recorded; scientific interpretation requires review'};
  const output={result,provenance},statements=[];
  if(['web_extract_text','web_extract_pdf'].includes(task.kind))statements.push(db.prepare("UPDATE files SET extracted=?,sha256=?,status=? WHERE id=? AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND state='running')").bind(JSON.stringify(result),input.sha256,result.complete?'extracted':'partial',f.id,task.id));
  const taskIndex=statements.length;statements.push(db.prepare("UPDATE tasks SET state='completed',result=?,updated=? WHERE id=? AND state='running'").bind(JSON.stringify(output),finished,task.id));
  statements.push(db.prepare("INSERT INTO audit (id,project,action,detail,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tasks WHERE id=? AND state='completed' AND updated=?)").bind(uid(),task.project,'task.completed',JSON.stringify({taskId:task.id,kind:task.kind,provenance}),finished,task.id,finished));
  statements.push(db.prepare("INSERT INTO messages (id,project,role,content,status,created) SELECT ?,?,'tool',?,'complete',? WHERE EXISTS (SELECT 1 FROM tasks WHERE id=? AND state='completed' AND updated=?)").bind(uid(),task.project,`${task.kind} completed. Review the result and input fingerprint in Activity.`,finished,task.id,finished));
  const saved=await db.batch(statements);return json({id:task.id,state:saved[taskIndex].meta.changes?'completed':'cancelled'});
 }catch(e){
  const failed=await run(db,"UPDATE tasks SET state='failed',error=?,updated=? WHERE id=? AND state='running'",String(e.message).slice(0,2000),now(),task.id);
  if(failed.meta.changes)await audit(db,task.project,'task.failed',{taskId:task.id,error:String(e.message).slice(0,2000)});
  return json({id:task.id,state:failed.meta.changes?'failed':'cancelled'});
 }
}
