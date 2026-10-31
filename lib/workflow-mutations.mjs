import {uid,now,AppError} from './core.mjs';
import {claimScreeningFileDeletion} from './independent-screening.mjs';

/** The audit entry and the compared update either commit together or do nothing. */
export async function commitAuditedChange(db,{project,table,id,before,after,action,detail}){
 // Table and column names come only from internal callers, never request values.
 const columns=Object.keys(before),values=columns.map(key=>before[key]),predicate='id=? AND '+columns.map(key=>key+' IS ?').join(' AND ');
 const eventId=uid(),changed=Object.keys(after);
 const results=await db.batch([
  db.prepare('INSERT INTO audit(id,project,action,detail,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM '+table+' WHERE '+predicate+')').bind(eventId,project,action,JSON.stringify(detail),now(),id,...values),
  db.prepare('UPDATE '+table+' SET '+changed.map(key=>key+'=?').join(',')+' WHERE '+predicate+' AND EXISTS(SELECT 1 FROM audit WHERE id=?)').bind(...changed.map(key=>after[key]),id,...values,eventId),
 ]);
 if(results[1].meta?.changes!==1)throw new AppError('This record changed while your edit was being saved. Reload before retrying; your edit was not applied.',409);
 return {ok:true};
}

/** Object storage and SQL are separate systems: retain a retryable tombstone on failure. */
export async function deleteOwnedFile(db,bucket,file){
 if(file.status!=='deleting')await claimScreeningFileDeletion(db,file.id);
 else {
  const ready=await db.prepare("UPDATE files SET status='deleting' WHERE id=? AND status='deleting' AND NOT EXISTS(SELECT 1 FROM screening_rounds r,json_each(r.snapshot,'$.files') sf WHERE json_extract(sf.value,'$.id')=?)").bind(file.id,file.id).run();
  if(ready.meta?.changes!==1)throw new AppError('Deletion state changed. Reload the project before retrying.',409);
 }
 try{
  // Aborting an already completed/aborted multipart upload is harmless. Original
  // deletion is idempotent, so a retry also works after an ambiguous network error.
  if(file.upload_id){try{await bucket.resumeMultipartUpload(file.key,file.upload_id).abort();}catch{}}
  await bucket.delete(file.key);
  const predicate="id=? AND status='deleting'";
  await db.batch([
   db.prepare('INSERT INTO audit(id,project,action,detail,created) SELECT ?,project,?,?,? FROM files WHERE '+predicate).bind(uid(),'file.deleted',JSON.stringify({fileId:file.id,name:file.name}),now(),file.id),
   db.prepare('DELETE FROM upload_parts WHERE file=? AND EXISTS(SELECT 1 FROM files WHERE '+predicate+')').bind(file.id,file.id),
   db.prepare('DELETE FROM files WHERE '+predicate).bind(file.id),
  ]);
  return {ok:true};
 }catch{
  // Never make an original available again after deletion may have reached the
  // object store. The database row and checksum remain only to resume cleanup.
  throw new AppError('File deletion is incomplete. This file remains unavailable to research workflows. Retry Delete to finish cleanup.',503);
 }
}
