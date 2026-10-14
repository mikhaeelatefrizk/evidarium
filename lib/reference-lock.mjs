import {run,uid,now,AppError} from './core.mjs';
/** Serializes source imports without trusting browser state. A crashed writer expires after 5 minutes. */
export async function withReferenceLock(db,project,fn){
 const token=uid(),time=now();const result=await run(db,'INSERT INTO reference_locks(project,token,created) VALUES (?,?,?) ON CONFLICT(project) DO UPDATE SET token=excluded.token,created=excluded.created WHERE reference_locks.created<?',project,token,time,time-300000);
 if(result.meta?.changes!==1)throw new AppError('A reference import is already running. Retry when it finishes; an interrupted import unlocks after five minutes.',409);
 try{return await fn(token)}finally{await run(db,'DELETE FROM reference_locks WHERE project=? AND token=?',project,token)}
}
