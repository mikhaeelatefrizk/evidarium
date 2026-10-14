import {all,first,run,json,uid,now,audit,AppError,PART_SIZE} from './core.mjs';
const fail=(s,n=400)=>{throw new AppError(s,n)};
export async function handleUpload(req,{db,bucket},f,action){
 // Legacy upload recovery is bounded data work, not a schema migration. Run only
 // after core has checked the authenticated owner. Stored files need no backfill.
 if(['uploading','completing'].includes(f.status)&&f.parts&&f.parts!=='[]'){
  let legacy;try{legacy=JSON.parse(f.parts)}catch{fail('The old upload manifest is invalid. Start a new upload.',409)}
  if(!Array.isArray(legacy)||legacy.length>Math.ceil(f.size/PART_SIZE)||legacy.some(p=>!Number.isInteger(p.partNumber)||p.partNumber<1||p.partNumber>Math.ceil(f.size/PART_SIZE)||typeof p.sha256!=='string'||typeof p.etag!=='string'||!Number.isSafeInteger(p.size)||p.size<1))fail('The old upload manifest is invalid. Start a new upload.',409);
  await run(db,"INSERT OR IGNORE INTO upload_parts(file,part_number,sha256,size,etag,state,token,updated) SELECT ?,json_extract(value,'$.partNumber'),json_extract(value,'$.sha256'),json_extract(value,'$.size'),json_extract(value,'$.etag'),'complete','legacy-recovery',? FROM json_each(?)",f.id,now(),f.parts);
 }
 if(action==='upload-status'&&req.method==='GET')return json({id:f.id,name:f.name,size:f.size,status:f.status,partSize:PART_SIZE,parts:await all(db,'SELECT part_number AS partNumber,sha256,size,state FROM upload_parts WHERE file=? ORDER BY part_number',f.id)});
 if(action==='part'&&req.method==='PUT'){
  if(f.status!=='uploading')fail('Upload is no longer open.',409);
  const index=Number(new URL(req.url).searchParams.get('n')),expected=Math.min(PART_SIZE,f.size-(index-1)*PART_SIZE);if(!Number.isInteger(index)||index<1||expected<=0)fail('Invalid part number.');if(Number(req.headers.get('content-length')||0)>PART_SIZE)fail('Part too large.',413);
  const bytes=await req.arrayBuffer();if(bytes.byteLength!==expected)fail('Unexpected part length.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');if(req.headers.get('x-part-sha256')!==hash)fail('Upload checksum mismatch.');
  const old=await first(db,'SELECT * FROM upload_parts WHERE file=? AND part_number=?',f.id,index);
  if(old&&old.sha256!==hash)fail('This part differs from the original upload. Start a new upload for a changed file.',409);
  if(old?.state==='complete')return json({partNumber:index,sha256:hash,reused:true});
  const token=uid(),time=now();const reserved=await run(db,"INSERT INTO upload_parts(file,part_number,sha256,size,state,token,updated) SELECT ?,?,?,?,'writing',?,? WHERE EXISTS(SELECT 1 FROM files WHERE id=? AND status='uploading') ON CONFLICT(file,part_number) DO UPDATE SET state='writing',token=excluded.token,updated=excluded.updated WHERE upload_parts.sha256=excluded.sha256 AND (upload_parts.state='failed' OR (upload_parts.state='writing' AND upload_parts.updated<?))",f.id,index,hash,bytes.byteLength,token,time,f.id,time-120000);
  if(reserved.meta?.changes!==1)fail('This part is already being uploaded. Retry after the active upload finishes; interrupted parts can be retried after two minutes.',409);
  try{const part=await bucket.resumeMultipartUpload(f.key,f.upload_id).uploadPart(index,bytes);const saved=await run(db,"UPDATE upload_parts SET etag=?,state='complete',updated=? WHERE file=? AND part_number=? AND token=? AND EXISTS(SELECT 1 FROM files WHERE id=? AND status='uploading')",part.etag,now(),f.id,index,token,f.id);if(saved.meta?.changes!==1)fail('Upload state changed; reload its status before retrying.',409);return json({partNumber:index,sha256:hash});}catch(e){await run(db,"UPDATE upload_parts SET state='failed',updated=? WHERE file=? AND part_number=? AND token=?",now(),f.id,index,token);throw e;}
 }
 if(action==='complete'&&req.method==='POST'){
  if(f.status==='stored')return json({ok:true,reused:true});
  if(!['uploading','completing'].includes(f.status))fail('Upload is no longer open.',409);
  const parts=await all(db,"SELECT part_number AS partNumber,etag,sha256,size FROM upload_parts WHERE file=? AND state='complete' ORDER BY part_number",f.id);
  if(parts.length!==Math.ceil(f.size/PART_SIZE)||parts.some((p,i)=>p.partNumber!==i+1)||parts.reduce((a,p)=>a+p.size,0)!==f.size)fail('Some upload parts are missing.');
  if(f.status==='uploading'){const changed=await run(db,"UPDATE files SET status='completing' WHERE id=? AND status='uploading'",f.id);if(changed.meta?.changes!==1)fail('Completion is already running. Reload upload status.',409);}
  const existing=await bucket.get(f.key);if(existing){try{await existing.body.cancel()}catch{}}else await bucket.resumeMultipartUpload(f.key,f.upload_id).complete(parts.map(({partNumber,etag})=>({partNumber,etag})));
  const time=now();await db.batch([db.prepare('INSERT INTO audit(id,project,action,detail,created) SELECT ?,project,?,?,? FROM files WHERE id=? AND status=\'completing\'').bind(uid(),'file.stored',JSON.stringify({fileId:f.id,name:f.name,bytes:f.size,integrity:'SHA-256 checked per upload part',parsing:'not yet extracted'}),time,f.id),db.prepare("UPDATE files SET status='stored',parts=? WHERE id=? AND status='completing'").bind(JSON.stringify(parts),f.id)]);
  return json({ok:true});
 }
 return null;
}
