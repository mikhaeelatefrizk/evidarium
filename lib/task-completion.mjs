import {first,uid,now,AppError} from './core.mjs';

// File text, task result and completion receipts commit together. A tombstone,
// changed original or cancelled task must never be overwritten by a late worker.
export async function commitTaskCompletion(db,task,output,extraction=null){
 if(extraction?.originalSha256&&extraction.originalSha256!==extraction.sha256)throw new AppError('The original bytes no longer match their recorded checksum. No extraction was saved.',409);
 const time=now(),event=uid(),statements=[];
 if(extraction)statements.push(db.prepare("UPDATE files SET extracted=?,status=?,sha256=? WHERE id=? AND project=? AND sha256 IS ? AND status NOT IN ('uploading','completing','deleting') AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND state='running')").bind(JSON.stringify(extraction.result),extraction.result.complete?'extracted':'partial',extraction.sha256,extraction.fileId,task.project,extraction.originalSha256??null,task.id));
 const taskIndex=statements.length;
 statements.push(db.prepare("UPDATE tasks SET state='completed',result=?,updated=? WHERE id=? AND state='running'"+(extraction?' AND changes()=1':'')).bind(JSON.stringify(output),time,task.id));
 statements.push(db.prepare("INSERT INTO audit(id,project,action,detail,created) SELECT ?,?,'task.completed',?,? WHERE changes()=1").bind(event,task.project,JSON.stringify({taskId:task.id,kind:task.kind,provenance:output.provenance}),time));
 statements.push(db.prepare("INSERT INTO messages(id,project,role,content,status,created) SELECT ?,?,'tool',?,'complete',? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)").bind(uid(),task.project,`${task.kind} completed. Review the result and input fingerprint in Activity.`,time,event));
 const saved=await db.batch(statements);
 if(saved[taskIndex].meta?.changes===1)return 'completed';
 const current=await first(db,'SELECT state FROM tasks WHERE id=?',task.id);
 if(current?.state==='running')throw new AppError('Input evidence changed or was removed during extraction. No extracted text or completed result was saved.',409);
 return current?.state||'cancelled';
}
export async function failRunningTask(db,task,error){
 const time=now(),event=uid(),detail=String(error?.message||error).slice(0,4000);
 const saved=await db.batch([
  db.prepare("UPDATE tasks SET state='failed',error=?,updated=? WHERE id=? AND state='running'").bind(detail,time,task.id),
  db.prepare("INSERT INTO audit(id,project,action,detail,created) SELECT ?,?,'task.failed',?,? WHERE changes()=1").bind(event,task.project,JSON.stringify({taskId:task.id,error:detail}),time),
  db.prepare("INSERT INTO messages(id,project,role,content,status,created) SELECT ?,?,'tool',?,'complete',? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)").bind(uid(),task.project,`${task.kind} failed: ${detail}. No completed result was recorded.`,time,event)
 ]);
 return saved[0].meta?.changes===1?'failed':(await first(db,'SELECT state FROM tasks WHERE id=?',task.id))?.state||'cancelled';
}
