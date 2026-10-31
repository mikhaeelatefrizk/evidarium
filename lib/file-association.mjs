import {first,json,uid,now,AppError} from './core.mjs';

const fail=(message,status=400)=>{throw new AppError(message,status)};
// References in retained snapshots preserve the file/report relationship,
// including originally unlinked files already used in extraction history.
const referencedSql="EXISTS(SELECT 1 FROM screening_rounds r,json_each(r.snapshot,'$.files') sf WHERE json_extract(sf.value,'$.id')=?) OR EXISTS(SELECT 1 FROM review_workspaces r,json_each(r.data,'$.extractions') e WHERE json_extract(e.value,'$.fileId')=?) OR EXISTS(SELECT 1 FROM review_revisions r,json_each(r.data,'$.extractions') e WHERE json_extract(e.value,'$.fileId')=?)";
const eligible=f=>f&&!['uploading','completing','deleting'].includes(f.status)&&/^[a-f0-9]{64}$/i.test(f.sha256||'');
async function view(db,f){const referenced=await first(db,'SELECT 1 WHERE '+referencedSql,f.id,f.id,f.id);return {fileId:f.id,sourceId:f.source_id||null,revision:f.link_revision,sha256:f.sha256,status:f.status,locked:!!referenced,notice:'Link the original to the report it actually contains. One original per report is currently supported. Retained screening or extraction snapshots protect existing associations from changes.'};}
export async function handleFileAssociation(req,{db,readBody},file){
 const f=await first(db,'SELECT * FROM files WHERE id=? AND project=?',file.id,file.project);if(!f)fail('File not found.',404);
 if(req.method==='GET')return json(await view(db,f));
 if(req.method!=='PUT')fail('Endpoint not found.',404);
 if(!eligible(f))fail('Use a completed original with a SHA-256 checksum. Uploading, completing or deleting files cannot be linked.',409);
 const b=await readBody();if(!Number.isSafeInteger(b.revision)||b.revision<0||b.revision!==f.link_revision||b.sha256!==f.sha256)fail('The original or association changed. Reload it before linking.',409);
 const sourceId=b.sourceId===null?null:typeof b.sourceId==='string'&&b.sourceId.length<=100?b.sourceId:null;
 if(b.sourceId!==null&&!sourceId)fail('Choose a saved report or explicit unlink.');
 if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>2000||b.reason.includes('\0'))fail('Provide a short reason for changing the association.');
 if(sourceId&&!await first(db,'SELECT 1 FROM sources WHERE id=? AND project=?',sourceId,f.project))fail('Report not found in this project.',404);
 if(sourceId===(f.source_id||null))return json(await view(db,f));
 const time=now(),next=f.link_revision+1;
 const noReferences='NOT ('+referencedSql+')';
 let result;
 try{result=await db.batch([
  db.prepare(`UPDATE files SET source_id=?,link_revision=link_revision+1 WHERE id=? AND project=? AND link_revision=? AND sha256=? AND status NOT IN ('uploading','completing','deleting') AND ${noReferences} AND (? IS NULL OR EXISTS(SELECT 1 FROM sources WHERE id=? AND project=?))`)
   .bind(sourceId,f.id,f.project,b.revision,b.sha256,f.id,f.id,f.id,sourceId,sourceId,f.project),
  db.prepare("INSERT INTO audit(id,project,action,detail,created) SELECT ?,project,'file.report_associated',?,? FROM files WHERE id=? AND project=? AND link_revision=? AND source_id IS ? AND changes()=1")
   .bind(uid(),JSON.stringify({fileId:f.id,previousSourceId:f.source_id||null,sourceId,revision:next,sha256:f.sha256,reason:b.reason.trim()}),time,f.id,f.project,next,sourceId)
 ]);}catch(e){if(/UNIQUE constraint failed: files.project, files.source_id/.test(e.message))fail('This report already has a linked original. Unlink that original first only if it has no retained screening or extraction history.',409);throw e;}
 if(result[0].meta?.changes!==1)fail('The file changed or is preserved by screening/extraction history. Its association was not replaced.',409);
 return json(await view(db,await first(db,'SELECT * FROM files WHERE id=?',f.id)));
}
