/** Standalone local edition. No hosted-origin bridge and no credential forwarding. */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdirSync,existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {readFile,stat,rm,copyFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {createInterface} from 'node:readline';
import {handleApi,json,uid,now,clean,all,first,run,audit,message,projectFor,projectData,addSource,literatureSearch,recordClaim,AppError} from '../lib/core.mjs';
import {createDB,createBucket,sha256File} from './storage.mjs';
import {chatContext,evidenceSearch} from './context.mjs';
import {checkCitations} from '../lib/citations.mjs';
import {importOpenArticle} from '../lib/papers.mjs';
import {enginePython} from './engine-runtime.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const KINDS=['extract','describe_csv','meta_analysis','screen_rank','symbolic_regression','mechanism_graph','python','paperqa','openscholar','biomni'];
export function createApplication({dataRoot,python,worker=pythonWorker}={}){
 dataRoot=dataRoot||process.env.EVIDARIUM_DATA_DIR||path.join(os.homedir(),'.evidarium');mkdirSync(dataRoot,{recursive:true,mode:0o700});
 python=python||process.env.EVIDARIUM_PYTHON||path.join(base,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 const db=createDB(path.join(dataRoot,'research.sqlite'),path.join(base,'drizzle')),bucket=createBucket(path.join(dataRoot,'files'));
 const user={userId:'local',displayName:'Local researcher'};const running=new Map();let loginJob=null,statusCache=null,statusAt=0,statusJob=null;let preparingAnalysis=false,preparingChat=false;
 db.raw.exec("UPDATE tasks SET state='interrupted',error='The local app stopped before execution completed. Review and prepare a new task.',updated="+now()+" WHERE state IN ('running','queued'); UPDATE messages SET status='partial' WHERE status='streaming';");
 function invoke(payload,onEvent){const selected=payload.command==='tool'?enginePython(dataRoot,payload.kind,python):python;return worker({python:selected,dataRoot,payload,onEvent})}
 async function status(){if(loginJob)return {connected:false,models:[],pending:true,url:loginJob.url};if(statusCache&&now()-statusAt<30000)return statusCache;if(!statusJob)statusJob=invoke({command:'status'}).promise.then(result=>{statusCache=result;statusAt=now();return result}).catch(e=>({connected:false,models:[],error:e.message})).finally(()=>{statusJob=null});return statusJob}
 async function prepare(p,kind,args,origin='human'){
  if(!KINDS.includes(kind))throw new AppError('Unknown analysis engine.');if(!args||typeof args!=='object'||Array.isArray(args))throw new AppError('Task parameters must be a JSON object.');
  if(JSON.stringify(args).length>100000)throw new AppError('Task parameters exceed 100,000 characters.');
  const safe=Object.fromEntries(Object.entries(args).filter(([k])=>!k.startsWith('_')));
  if(safe.file_id){const f=await first(db,'SELECT * FROM files WHERE id=? AND project=?',safe.file_id,p.id);if(!f||f.status==='uploading')throw new AppError('Select a completed file in this project.');safe.file_name=f.name;safe.input_sha256=await sha256File(bucket.filepath(f.key))}
  else if(['extract','describe_csv','meta_analysis','symbolic_regression','paperqa','openscholar'].includes(kind))throw new AppError('This engine requires an uploaded input file.');
  if(kind==='python'&&!clean(safe.code,100000))throw new AppError('Provide the exact Python code to review.');
  const id=uid();await run(db,'INSERT INTO tasks (id,project,kind,args,state,created,updated) VALUES (?,?,?,?,?,?,?)',id,p.id,kind,JSON.stringify(safe),'awaiting_approval',now(),now());await audit(db,p.id,'task.proposed',{taskId:id,kind,parameters:safe,origin});return {id,state:'awaiting_approval',kind,parameters:safe};
 }
 async function finishTask(t,payload,job){
  try{const output=await job.promise;const current=await first(db,'SELECT state FROM tasks WHERE id=?',t.id);if(current?.state!=='running')return;
   if(t.kind==='extract'){
    const result=output.result;await run(db,'UPDATE files SET extracted=?,status=?,sha256=? WHERE id=?',JSON.stringify(result),result.complete?'extracted':'partial',output.provenance.input_sha256,payload.args.file_id);
    output.result={characters:result.characters,segments:result.segments.length,warnings:result.warnings,complete:result.complete,method:result.method};
   }
   if(output.result?.artifact_files){const saved=[];for(const artifact of output.result.artifact_files){const bytes=Buffer.from(artifact.base64,'base64');if(bytes.length>4*1024**2)continue;const id=uid(),name=clean(artifact.name,200).replace(/[\/\\]/g,'_'),key='local/'+t.project+'/'+id;await bucket.put(key,bytes);const sha=await sha256File(bucket.filepath(key));await run(db,'INSERT INTO files (id,project,name,mime,size,key,status,parts,sha256,created) VALUES (?,?,?,?,?,?,?,?,?,?)',id,t.project,name,'application/octet-stream',bytes.length,key,'generated','[]',sha,now());saved.push({id,name,sha256:sha})}delete output.result.artifact_files;output.result.saved_artifacts=saved}
   await run(db,'UPDATE tasks SET state=?,result=?,updated=? WHERE id=?','completed',JSON.stringify(output),now(),t.id);await audit(db,t.project,'task.completed',{taskId:t.id,kind:t.kind,provenance:output.provenance});await message(db,t.project,'tool',`${t.kind} completed. Inspect task ${t.id} in Activity for the result, parameters, and provenance.`);
  }catch(e){if((await first(db,'SELECT state FROM tasks WHERE id=?',t.id))?.state==='running'){await run(db,'UPDATE tasks SET state=?,error=?,updated=? WHERE id=?','failed',clean(e.message,4000),now(),t.id);await audit(db,t.project,'task.failed',{taskId:t.id,error:clean(e.message,4000)});await message(db,t.project,'tool',`${t.kind} failed: ${clean(e.message,4000)}. No completed result was recorded.`)}}
  finally{running.delete(t.id);await rm(path.join(dataRoot,'jobs',t.id),{recursive:true,force:true})}
 }
 async function approve(t){
  if(preparingAnalysis)throw new AppError('An analysis is being prepared.',409);
  preparingAnalysis=true;try{
  if(t.state!=='awaiting_approval')throw new AppError('Only a pending task can be approved.',409);
  if([...running.values()].some(x=>x.kind!=='chat'))throw new AppError('One analysis is already running. Finish or cancel it first.',409);
  const args=JSON.parse(t.args);let snapshot=null;
  if(args.file_id){const f=await first(db,'SELECT * FROM files WHERE id=? AND project=?',args.file_id,t.project);if(!f)throw new AppError('Input file was removed.');const source=bucket.filepath(f.key);if(await sha256File(source)!==args.input_sha256)throw new AppError('The input changed since the task was proposed. Prepare a new task.');const dir=path.join(dataRoot,'jobs',t.id);await mkdir(dir,{recursive:true,mode:0o700});snapshot=path.join(dir,'input'+path.extname(f.name));await copyFile(source,snapshot);args._file_name=f.name}
  args._task_id=t.id;const p=await projectFor(db,t.project,'local');const payload={command:'tool',kind:t.kind,args,path:snapshot,project:await projectData(db,p)};
  const claimed=await run(db,"UPDATE tasks SET state='running',updated=? WHERE id=? AND state='awaiting_approval'",now(),t.id);if(!claimed.meta.changes)throw new AppError('This task changed while approval was being prepared.',409);await audit(db,t.project,'task.approved',{taskId:t.id,parameters:args,execution:'local',network:['paperqa','openscholar','symbolic_regression','extract'].includes(t.kind)?'Engine may fetch dependencies or contact configured local models; inspect guide':'custom code isolated with network disabled; trusted adapters run in local Python'});
  const job=invoke(payload);running.set(t.id,{...job,kind:t.kind});finishTask(t,payload,job);return {id:t.id,state:'running'};
  }finally{preparingAnalysis=false}
 }
 async function beginChat(p,text,model){
  if(preparingChat)throw new AppError('A model request is being prepared.',409);
  preparingChat=true;try{
  if([...running.values()].some(x=>x.kind==='chat'))throw new AppError('A model response is already running.',409);if(loginJob)throw new AppError('Complete sign-in first.',409);
  const selected=await status();if(!selected.connected||!selected.models?.some(m=>m.slug===model))throw new AppError('Connect ChatGPT and select an available model first.',409);
  await message(db,p.id,'user',text);const context=await chatContext(db,p,text),id=uid(),mid=await message(db,p.id,'assistant','',model,'streaming');await run(db,'INSERT INTO tasks (id,project,kind,args,state,created,updated) VALUES (?,?,?,?,?,?,?)',id,p.id,'chat',JSON.stringify({model,coverage:context.context.coverage}),'running',now(),now());await audit(db,p.id,'chat.started',{taskId:id,model,coverage:context.context.coverage});
  const seen=new Set();const remember=items=>{for(const x of items||[]){if(x.type==='source'||x.origin)seen.add('S:'+x.id);if(x.type==='file')seen.add('F:'+x.id+':'+x.location)}};remember(context.context.evidence.results);
  let content='',lastFlush=0;const job=invoke({command:'chat',model,...context},async(event,reply)=>{
   if(event.event==='delta'){content+=event.text;if(now()-lastFlush>300){lastFlush=now();await run(db,'UPDATE messages SET content=? WHERE id=?',content,mid)}}
   if(event.event==='tool_call'){
    let result;try{const args=JSON.parse(event.arguments);const name=event.name.replace(/^evidarium\./,'');
     if(name==='evidence_search')result=await evidenceSearch(db,p.id,clean(args.query,500));
     else if(name==='import_article')result=await importOpenArticle({db,bucket,project:await projectFor(db,p.id,'local'),owner:'local',sourceId:args.source_id});
     else if(name==='record_claim')result=await recordClaim(db,p.id,args,'assistant');
     else if(name==='literature_search'){const current=await projectFor(db,p.id,'local');if(!current.allow_search)throw new Error('External searches are disabled for this project.');const rows=await literatureSearch(args.query,args.provider);result=[];for(const s of rows){const added=await addSource(db,p.id,s);result.push({...s,id:added.id})}await audit(db,p.id,'search.completed',{query:args.query,provider:args.provider,origin:'assistant requested',returned:rows.length,comprehensive:false});await message(db,p.id,'tool',`Exploratory ${args.provider} search: ${rows.length} records saved as unreviewed evidence for “${clean(args.query,500)}”.`)}
     else if(name==='propose_task')result=await prepare(p,args.kind,JSON.parse(args.parameters_json),'assistant');
     else throw new Error('Unsupported tool.');await audit(db,p.id,'chat.tool',{taskId:id,name,arguments:args});
    }catch(e){result={error:clean(e.message,2000)}}remember(Array.isArray(result)?result:result?.results);reply(result);
   }
  });running.set(id,{...job,kind:'chat',messageId:mid});
  job.promise.then(async result=>{if((await first(db,'SELECT state FROM tasks WHERE id=?',id))?.state!=='running')return;const citationAudit=await checkCitations(db,p.id,content,{seen});await run(db,"UPDATE messages SET content=?,status='complete',citation_audit=? WHERE id=?",content,JSON.stringify(citationAudit),mid);result={...result,citation_audit:citationAudit};await run(db,"UPDATE tasks SET state='completed',result=?,updated=? WHERE id=?",JSON.stringify(result),now(),id);await audit(db,p.id,'chat.completed',{taskId:id,...result})}).catch(async e=>{if((await first(db,'SELECT state FROM tasks WHERE id=?',id))?.state!=='running')return;await run(db,"UPDATE messages SET content=?,status='partial' WHERE id=?",content||'No completed model output was received.',mid);await run(db,"UPDATE tasks SET state='failed',error=?,updated=? WHERE id=?",clean(e.message,4000),now(),id);await message(db,p.id,'tool','Model request failed: '+clean(e.message,4000))}).finally(()=>running.delete(id));return {id,state:'running'};
  }finally{preparingChat=false}
 }
 async function localApi(req){try{
  const u=new URL(req.url),route=u.pathname.replace('/api/','');if(req.method!=='GET'){if(req.headers.get('origin')&&req.headers.get('origin')!==u.origin)throw new AppError('Cross-origin writes are not allowed.',403)}
  if(req.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Cross-site access is not allowed.',403);
  const read=async()=>{const text=await req.text();if(text.length>3*1024**2)throw new AppError('Request too large.',413);try{return JSON.parse(text)}catch{throw new AppError('Invalid JSON.')}};
  if(route==='ai/status'&&req.method==='GET')return json(await status());
  if(route==='ai/login'&&req.method==='POST'){
   if(loginJob)return json({pending:true,url:loginJob.url});if(running.size)throw new AppError('Finish running tasks before changing model authorization.',409);
   const job=invoke({command:'login'},event=>{if(event.event==='authorization'&&loginJob)loginJob.url=event.url});loginJob={...job,url:null};statusCache=null;
   job.promise.then(result=>{statusCache={...result,models:[]};statusAt=0}).catch(e=>{statusCache={connected:false,models:[],error:e.message};statusAt=now()}).finally(()=>{loginJob=null});return json({pending:true,message:'Your system browser opens the official ChatGPT sign-in page. Return after authorizing.'});
  }
  if(route==='ai/logout'&&req.method==='POST'){if(running.size||loginJob)throw new AppError('Finish or cancel active tasks before disconnecting.',409);const result=await invoke({command:'logout'}).promise;statusCache=result;statusAt=now();return json(result)}
  if(route==='capabilities'&&req.method==='GET')return json(await invoke({command:'capabilities'}).promise);
  if(route==='chat'&&req.method==='POST'){const b=await read(),p=await projectFor(db,b.project,user.userId);const text=clean(b.text,20000);if(!text)throw new AppError('Message is empty.');return json(await beginChat(p,text,clean(b.model,150)),202)}
  if(route==='tasks'&&req.method==='POST'){const b=await read(),p=await projectFor(db,b.project,user.userId);return json(await prepare(p,b.kind,b.args),201)}
  if(/^tasks\/[^/]+\/(approve|cancel)$/.test(route)&&req.method==='POST'){
   const [,id,action]=route.split('/'),t=await first(db,'SELECT * FROM tasks WHERE id=?',id);if(!t)throw new AppError('Task not found.',404);await projectFor(db,t.project,user.userId);
   if(action==='approve')return json(await approve(t),202);
   if(!['running','awaiting_approval','queued'].includes(t.state))throw new AppError('This task has already ended.',409);
   await run(db,"UPDATE tasks SET state='cancelled',updated=? WHERE id=?",now(),id);const job=running.get(id);job?.cancel();if(job?.messageId)await run(db,"UPDATE messages SET status='partial' WHERE id=?",job.messageId);
   if(['python','biomni'].includes(t.kind)){const stopper=spawn('docker',['rm','-f','evidarium-'+id],{stdio:'ignore'});stopper.on('error',()=>{})}await audit(db,t.project,'task.cancelled',{taskId:id});return json({id,state:'cancelled'});
  }
  return handleApi(req,{db,bucket,user,local:true});
 }catch(e){return json({error:clean(e.message,4000)||'Request failed'},e.status||500)}}
 return {db,bucket,handle:localApi,async close(){for(const job of running.values())job.cancel();loginJob?.cancel();await Promise.allSettled([...running.values()].map(j=>j.promise));db.close()}};
}
export function pythonWorker({python,dataRoot,payload,onEvent}){
 let result,error,chain=Promise.resolve(),cancelled=false,finished=false;
 const child=spawn(python,['-m','evidarium_agent'],{cwd:path.join(base,'companion'),env:{...process.env,EVIDARIUM_DATA_DIR:dataRoot,PYTHONUNBUFFERED:'1'},stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true});
 const reply=v=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(v)+'\n')};let total=0;
 const promise=new Promise((resolve,reject)=>{
  child.once('error',e=>{finished=true;reject(new Error('The Python worker could not start. Run the installation script first. '+e.code))});
  // Third-party engines can log verbosely; drain logs without exposing credentials or filling memory.
  child.stderr.resume();const lines=createInterface({input:child.stdout});lines.on('line',line=>{total+=line.length;if(total>24*1024**2){error='Worker output exceeded 24 MiB.';cancel();return}let event;try{event=JSON.parse(line)}catch{error='The worker returned an invalid protocol message.';return}if(event.event==='result')result=event.result;else if(event.event==='error')error=event.error;else chain=chain.then(()=>onEvent?.(event,reply)).catch(e=>{error=e.message;reply({error:e.message})})});
  child.once('close',async code=>{finished=true;await chain;if(cancelled)reject(new Error('Task cancelled.'));else if(error||code!==0||result===undefined)reject(new Error(error||'Worker stopped without a completed result.'));else resolve(result)});
  child.stdin.on('error',()=>{});reply(payload);
 });
 const timer=setTimeout(()=>{error='Task exceeded the 35-minute execution limit.';cancel()},35*60*1000);timer.unref();promise.finally(()=>clearTimeout(timer)).catch(()=>{});
 function cancel(){if(finished)return;cancelled=true;try{if(process.platform==='win32'){const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});killer.on('error',()=>child.kill())}else process.kill(-child.pid,'SIGTERM')}catch{child.kill()}}
 return {promise,cancel};
}

export async function start(){
 const dataRoot=process.env.EVIDARIUM_DATA_DIR||path.join(os.homedir(),'.evidarium');mkdirSync(dataRoot,{recursive:true,mode:0o700});const lock=path.join(dataRoot,'server.lock');
 try{writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600})}catch{let live=false;try{process.kill(Number(readFileSync(lock,'utf8')),0);live=true}catch{}if(live)throw Error('Evidarium is already running for this data directory.');unlinkSync(lock);writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600})}
 const app=createApplication({dataRoot});const port=Number(process.env.EVIDARIUM_PORT||4317);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose a local port from 1024 to 65535.');const origin='http://127.0.0.1:'+port;
 const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!=='127.0.0.1:'+port){res.writeHead(403);res.end('Invalid host.');return}
  if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end('Cross-origin access denied.');return}
  let response;const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>9*1024**2)throw new AppError('Request too large.',413);chunks.push(chunk)}const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});response=await app.handle(request)}
  else{
   let relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);let root=path.join(base,'dist-local');
   if(relative==='guide')relative='guide.html'
   if(relative==='downloads/evidarium-source.zip'){root=path.join(base,'public');}
   const target=path.resolve(root,relative);if(!target.startsWith(path.resolve(root)+path.sep)||!existsSync(target)||(await stat(target)).isDirectory())response=new Response('Not found',{status:404});else {const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.zip':'application/zip'}[path.extname(target)]||'application/octet-stream';response=new Response(await readFile(target),{headers:{'Content-Type':mime,'Cache-Control':'no-store'}})}
  }
  res.writeHead(response.status,{...Object.fromEntries(response.headers),'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin'});if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
 }catch(e){if(!res.headersSent){res.writeHead(e.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}else res.end()}});
 server.requestTimeout=120000;server.headersTimeout=10000;
 const cleanup=async()=>{server.close();await app.close();try{unlinkSync(lock)}catch{}process.exit(0)};process.once('SIGINT',cleanup);process.once('SIGTERM',cleanup);server.on('error',e=>{try{unlinkSync(lock)}catch{}console.error(e.message);process.exit(1)});
 server.listen(port,'127.0.0.1',()=>{console.log('Evidarium local edition: '+origin+'\nKeep this terminal open. Press Ctrl+C to stop.');if(process.env.EVIDARIUM_NO_OPEN!=='1'){const cmd=process.platform==='win32'?['cmd',['/c','start','',origin]]:process.platform==='darwin'?['open',[origin]]:['xdg-open',[origin]];spawn(cmd[0],cmd[1],{stdio:'ignore'}).on('error',()=>{})}});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start().catch(e=>{console.error(e.message);process.exit(1)});
