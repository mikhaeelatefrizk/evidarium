import {all,first,json,uid,now,AppError,toCsv} from './core.mjs';
import {PROTOCOL_FIELDS,REVIEW_LIMITS,emptyReview,reviewReadiness} from './review-model.mjs';
const fail=(message,status=400)=>{throw new AppError(message,status)};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const str=(v,max,name,required=false)=>{if(typeof v!=='string'||v.length>max||v.includes('\0')||(required&&!v.trim()))fail('Invalid '+name+'. Check the required text and length.');return v.trim()};
const identifier=(v,name)=>str(v,100,name,true);
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(n=>n.toString(16).padStart(2,'0')).join('');
const download=(text,name,type)=>new Response(text,{headers:{'Content-Type':type+'; charset=utf-8','Content-Disposition':'attachment; filename="'+name+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function validateReviewShape(input){
 if(!object(input)||!object(input.protocol)||!Array.isArray(input.studies)||!Array.isArray(input.extractions))fail('Invalid review workspace.');
 if(input.studies.length>REVIEW_LIMITS.studies||input.extractions.length>REVIEW_LIMITS.extractions||JSON.stringify(input).length>REVIEW_LIMITS.characters)fail('Review limit: 200 studies, 500 extractions and 300,000 characters.');
 const data=emptyReview();
 for(const [key] of PROTOCOL_FIELDS)data.protocol[key]=str(input.protocol[key]??'',12000,key);
 const studyIds=new Set(),reportIds=new Set(),entryIds=new Set();
 for(const s of input.studies){
  if(!object(s)||!Array.isArray(s.sourceIds)||!s.sourceIds.length||s.sourceIds.length>200)fail('Each study needs 1–200 linked reports.');
  const id=identifier(s.id,'study ID');if(studyIds.has(id))fail('Duplicate study ID.');studyIds.add(id);
  const sourceIds=s.sourceIds.map(id=>{identifier(id,'report ID');if(reportIds.has(id))fail('A report can belong to only one study.');reportIds.add(id);return id});
  data.studies.push({id,label:str(s.label,250,'study label',true),design:str(s.design??'',500,'study design'),notes:str(s.notes??'',4000,'study notes'),sourceIds});
 }
 for(const e of input.extractions){
  if(!object(e))fail('Invalid extraction record.');const id=identifier(e.id,'extraction ID');if(entryIds.has(id))fail('Duplicate extraction ID.');entryIds.add(id);
  const study=data.studies.find(s=>s.id===e.studyId);if(!study||!study.sourceIds.includes(e.sourceId))fail('Extraction evidence must belong to its linked study report.');
  if(!['unchecked','checked'].includes(e.reviewStatus))fail('Invalid extraction review status.');
  const entry={id,studyId:e.studyId,sourceId:e.sourceId,fileId:str(e.fileId??'',100,'file ID'),location:str(e.location??'',1000,'location'),field:str(e.field,200,'data field',true),value:str(e.value,4000,'value',true),unit:str(e.unit??'',100,'unit'),timepoint:str(e.timepoint??'',200,'time point'),quote:str(e.quote,10000,'quotation',true),reviewStatus:e.reviewStatus};
  if(entry.quote.length<12)fail('An exact quotation needs at least 12 characters.');data.extractions.push(entry);
 }
 return data;
}
export async function readReview(db,project){const row=await first(db,'SELECT * FROM review_workspaces WHERE project=?',project);return row?{revision:row.revision,updated:row.updated,data:JSON.parse(row.data)}:{revision:0,updated:null,data:emptyReview()};}
async function verifyReview(db,project,input,previous,actor){
 const data=validateReviewShape(input),sources=await all(db,'SELECT * FROM sources WHERE project=?',project),sourceMap=new Map(sources.map(s=>[s.id,s]));
 for(const study of data.studies)for(const id of study.sourceIds)if(!sourceMap.has(id))fail('A linked report is missing from this project.');
 const fileIds=new Set(data.extractions.map(e=>e.fileId).filter(Boolean)),fileMap=new Map();
 for(const id of fileIds){const f=await first(db,'SELECT id,source_id,extracted,sha256 FROM files WHERE id=? AND project=?',id,project);if(!f?.extracted)fail('Extraction evidence file is missing or has no extracted text.');fileMap.set(id,f)}
 for(const e of data.extractions){
  const imported=previous?.data.extractions.find(x=>x.id===e.id&&x.verification?.method==='external import; not rechecked');
  if(imported&&e.reviewStatus==='unchecked'&&['studyId','sourceId','fileId','location','field','value','unit','timepoint','quote'].every(k=>imported[k]===e[k])){e.verification=imported.verification;e.reviewedBy=null;e.reviewedAt=null;continue;}
  let text,location='abstract';const file=fileMap.get(e.fileId);
  if(file){if(file.source_id&&file.source_id!==e.sourceId)fail('This file belongs to a different report.');const segment=(JSON.parse(file.extracted).segments||[]).find(s=>s.location===e.location);if(!segment)fail('Choose an available text location.');text=segment.text;location=segment.location;}else text=sourceMap.get(e.sourceId).abstract;
  const start=text.indexOf(e.quote);if(start<0)fail('Exact quotation not found in the selected evidence. Nothing was saved.');e.location=location;
  const evidenceHash=await sha(text),old=previous?.data.extractions.find(x=>x.id===e.id);
  const same=old&&['studyId','sourceId','fileId','location','field','value','unit','timepoint','quote'].every(k=>old[k]===e[k])&&old.verification?.evidence_sha256===evidenceHash;
  if(old?.reviewStatus==='checked'&&e.reviewStatus==='checked'&&!same)fail('Changed evidence or values must be saved as unchecked before checking again.');
  e.verification={method:'exact substring match',start,end:start+e.quote.length,evidence_sha256:evidenceHash,file_sha256:file?.sha256||null,checked_at:new Date().toISOString(),scope:'Text presence only; interpretation and study quality are not established.'};
  e.reviewedBy=e.reviewStatus==='checked'?(same&&old.reviewStatus==='checked'?old.reviewedBy:actor):null;
  e.reviewedAt=e.reviewStatus==='checked'?(same&&old.reviewStatus==='checked'?old.reviewedAt:now()):null;
 }
 return {data,sources};
}
export async function saveReview(db,project,input,revision,reason,actor){
 if(!Number.isSafeInteger(revision)||revision<0)fail('A valid saved revision is required.');reason=str(reason,2000,'change reason',true);
 const previous=await readReview(db,project);if(previous.revision!==revision)fail('A newer saved revision exists. Download your unsaved changes before reloading.',409);
 const {data}=await verifyReview(db,project,input,previous,actor);
 return persistReview(db,project,data,revision,reason,actor);
}
async function persistReview(db,project,data,revision,reason,actor){
 const content=JSON.stringify(data);if(content.length>REVIEW_LIMITS.characters)fail('Review workspace exceeds 300,000 characters including verification records.');
 const time=now(),token=uid(),next=revision+1,hash=await sha(content),change=JSON.stringify({revision:next,reason,actor,sha256:hash,studies:data.studies.length,extractions:data.extractions.length});
 const statements=[revision===0?db.prepare('INSERT OR IGNORE INTO review_workspaces(project,data,revision,edit_token,updated) VALUES (?,?,?,?,?)').bind(project,content,next,token,time):db.prepare('UPDATE review_workspaces SET data=?,revision=?,edit_token=?,updated=? WHERE project=? AND revision=?').bind(content,next,token,time,project,revision),
 db.prepare('INSERT INTO review_revisions(project,revision,data,reason,actor,sha256,created) SELECT project,revision,data,?,?,?,updated FROM review_workspaces WHERE project=? AND edit_token=?').bind(reason,actor,hash,project,token),
 db.prepare('INSERT INTO audit(id,project,action,detail,created) SELECT ?,project,?,?,? FROM review_workspaces WHERE project=? AND edit_token=?').bind(uid(),'review.saved',change,time,project,token),
 db.prepare('DELETE FROM review_revisions WHERE project=? AND revision < (SELECT revision-29 FROM review_workspaces WHERE project=? AND edit_token=?)').bind(project,project,token)];
 const result=await db.batch(statements);if(result[0].meta?.changes!==1)fail('Another save won this revision. Download your unsaved changes before reloading.',409);
 return {revision:next,updated:time,data};
}
export function validateImportedReview(review,sources){
 if(!review?.revision)return null;
 const data=validateReviewShape(review.data),ids=new Set(sources.map(s=>s.id));
 for(const study of data.studies)for(const id of study.sourceIds)if(!ids.has(id))fail('Review import refers to a report missing from the project export.');
 return data;
}
export async function importReview(db,project,review,mapping,actor){
 if(!review?.revision)return;
 const data=validateReviewShape(review.data),studyIds=new Map(data.studies.map(s=>[s.id,uid()]));
 for(const study of data.studies){study.id=studyIds.get(study.id);study.sourceIds=study.sourceIds.map(id=>mapping[id]);}
 for(const e of data.extractions){e.id=uid();e.studyId=studyIds.get(e.studyId);e.sourceId=mapping[e.sourceId];e.reviewStatus='unchecked';e.reviewedBy=null;e.reviewedAt=null;e.verification={method:'external import; not rechecked',original_file_id:e.fileId||null,scope:'Externally supplied data. Reassociate original evidence and check before use.'};e.fileId='';}
 return persistReview(db,project,data,0,'Imported external review; evidence and history not independently verified.',actor);
}
export async function handleReviewWorkflow(req,{db,readBody,user},p){
 const url=new URL(req.url),parts=url.pathname.split('/').slice(5),method=req.method;
 if(!parts.length&&method==='GET'){const review=await readReview(db,p.id);return json({...review,readiness:reviewReadiness(review.data,await all(db,'SELECT id FROM sources WHERE project=?',p.id)),limits:REVIEW_LIMITS});}
 if(!parts.length&&method==='PUT'){const b=await readBody();return json(await saveReview(db,p.id,b.data,b.revision,b.reason,user.userId));}
 if(parts[0]==='history'&&method==='GET'){
  if(parts[1]){const row=await first(db,'SELECT * FROM review_revisions WHERE project=? AND revision=?',p.id,Number(parts[1]));if(!row)fail('Revision is outside the retained history.',404);return json({...row,data:JSON.parse(row.data)});}
  return json(await all(db,'SELECT revision,reason,actor,sha256,created FROM review_revisions WHERE project=? ORDER BY revision DESC',p.id));
 }
 if(parts[0]==='export'&&method==='GET'){
  const current=await readReview(db,p.id),sources=await all(db,'SELECT id,title,doi FROM sources WHERE project=?',p.id);
  if(url.searchParams.get('format')==='csv'){
   const rows=current.data.extractions.map(e=>({...e,study:current.data.studies.find(s=>s.id===e.studyId)?.label,report:sources.find(s=>s.id===e.sourceId)?.title,evidence_sha256:e.verification?.evidence_sha256,verification:e.verification?.scope}));
   return download('\ufeff'+toCsv(rows,['study','report','studyId','sourceId','fileId','location','field','value','unit','timepoint','quote','reviewStatus','reviewedBy','reviewedAt','evidence_sha256','verification']),'evidarium-extractions.csv','text/csv');
  }
  return download(JSON.stringify({schema:'evidarium.review.v1',...current,sources,history:(await all(db,'SELECT * FROM review_revisions WHERE project=? ORDER BY revision',p.id)).map(r=>({...r,data:JSON.parse(r.data)})),notice:'Manually linked studies; exact text matches do not verify findings. Review checks are by the project owner, not independent dual review. Latest 30 revisions. Original files are separate.'},null,2),'evidarium-review.json','application/json');
 }
 return null;
}
