import {all,first,uid,now,AppError,safeUrl,normalizeDoi,sourceKey} from './core.mjs';
import {withReferenceLock} from './reference-lock.mjs';
import {normalizeReference} from './references.mjs';
import {validateImportedReview,validateReviewShape,readReview} from './review-workflow.mjs';
import {REVIEW_LIMITS} from './review-model.mjs';

const fail=(message,status=400)=>{throw new AppError(message,status);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function text(value,max,label,{required=false,optional=true}={}){
 if(value===undefined||value===null){if(optional&&!required)return '';fail('Missing '+label+'. Nothing was imported.');}
 if(typeof value!=='string'||value.length>max||value.includes('\0')||(required&&!value.trim()))fail('Invalid '+label+'. Nothing was imported.');
 return value.trim();
}
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');

/** Validate the entire interchange before acquiring a lease or writing anything. */
function validateImport(input){
 if(!object(input)||input.schema!=='evidarium.project.v1'||!Array.isArray(input.sources))fail('Use an Evidarium project JSON export.');
 if(input.exported_at!==undefined)text(input.exported_at,100,'export timestamp');
 const limits={sources:1000,notes:100,messages:500,tasks:100,claims:500,audit:1000,manuscripts:20};
 for(const [key,limit] of Object.entries(limits)){
  if(input[key]!==undefined&&!Array.isArray(input[key]))fail('Invalid '+key+' collection. Nothing was imported.');
  if((input[key]||[]).length>limit)fail('Import accepts at most '+limit+' '+key+'. Nothing was imported.');
  if((input[key]||[]).some(x=>!object(x)))fail('Invalid entry in '+key+'. Nothing was imported.');
 }
 const ids=new Set();
 const sources=input.sources.map(s=>{
  const id=text(s.id,100,'source ID');
  if(id&&ids.has(id))fail('Duplicate source IDs would make evidence links ambiguous. Nothing was imported.');
  if(id)ids.add(id);
  const title=text(s.title,2000,'source title',{required:true});
  const doi=normalizeDoi(text(s.doi,300,'DOI'));
  let metadata='{}';
  if(s.metadata!==undefined&&s.metadata!==null&&s.metadata!==''){
   text(s.metadata,50000,'bibliographic metadata');
   try{const parsed=JSON.parse(s.metadata);if(!object(parsed))throw Error();if(parsed.csl)metadata=normalizeReference({...parsed.csl,title,DOI:doi||parsed.csl.DOI}).metadata;}catch{fail('Invalid bibliography metadata. Nothing was imported.');}
  }
  if(s.year!==undefined&&s.year!==null&&s.year!==''&&!Number.isFinite(Number(s.year)))fail('Invalid source year. Nothing was imported.');
  return {id,title,doi:doi||null,url:safeUrl(text(s.url,10000,'source URL')),authors:text(s.authors,3000,'authors'),year:s.year?Number(s.year):null,abstract:text(s.abstract,50000,'abstract'),origin:text(s.origin,100,'source origin')||'manual',external_id:text(s.external_id,200,'external ID')||null,pmcid:/^PMC\d+$/.test(s.pmcid||'')?s.pmcid:null,access:s.access==='open_access'?'open_access':'unknown',stage:['title_abstract','full_text','analysis'].includes(s.stage)?s.stage:'title_abstract',decision:['include','exclude','unknown'].includes(s.decision)?s.decision:'unknown',reason:text(s.reason,2000,'screening reason'),metadata};
 });
 for(const d of input.manuscripts||[]){text(d.title,200,'manuscript title',{required:true});text(d.content,200000,'manuscript text',{optional:false});}
 for(const n of input.notes||[])text(n.content,50000,'note text',{optional:false});
 for(const m of input.messages||[]){text(m.content,100000,'message text',{optional:false});text(m.model,100,'model');}
 for(const t of input.tasks||[]){text(t.kind,100,'task kind',{required:true});text(t.error,4000,'task error');}
 for(const c of input.claims||[]){text(c.statement,5000,'claim statement',{required:true});text(c.location,1000,'claim location');text(c.quote,10000,'claim quotation',{required:true});text(c.source_id,100,'claim source ID');}
 if(input.project!==undefined){
  if(!object(input.project))fail('Invalid project metadata. Nothing was imported.');
  if(input.project.question!==undefined)text(input.project.question,10000,'research question',{optional:false});
  if(input.project.criteria!==undefined)text(input.project.criteria,20000,'research criteria',{optional:false});
  if(input.project.allow_search!==undefined&&![0,1,true,false].includes(input.project.allow_search))fail('Invalid external-search preference. Nothing was imported.');
 }
 if(input.review_workspace!==undefined&&!object(input.review_workspace))fail('Invalid review workspace. Nothing was imported.');
 if(input.review_workspace?.revision)validateImportedReview(input.review_workspace,sources);
 return sources;
}

/** One SQLite/D1 transaction commits the complete import; failed writes leave no partial records. */
export async function importProjectAtomically(db,p,input){
 const sources=validateImport(input);
 if(input.review_workspace?.revision&&(await readReview(db,p.id)).revision)fail('Import into a new project to preserve both review workspaces. Nothing was imported.',409);
 return withReferenceLock(db,p.id,async token=>{
  if((input.manuscripts||[]).length+(await first(db,'SELECT COUNT(*) n FROM manuscripts WHERE project=?',p.id)).n>20)fail('Import would exceed the 20-manuscript project limit. Nothing was imported.');
  const existing=await all(db,'SELECT id,title,doi FROM sources WHERE project=?',p.id);
  const keys=new Map(existing.map(s=>[sourceKey(s),s.id])),mapping=Object.create(null),statements=[];
  const time=now(),startId=uid();let added=0;
  // Every mutation carries the lease check. An expired lease cannot commit a subset.
  // The first marker compares mutable project metadata before any import records
  // are admitted. Later writes use the marker, so changing the protocol within
  // this same transaction does not invalidate the final audit write.
  const guard='EXISTS(SELECT 1 FROM reference_locks WHERE project=? AND token=?) AND EXISTS(SELECT 1 FROM audit WHERE id=?)';
  const insert=(table,columns,values)=>{
   const bytes=values.reduce((total,value)=>total+(typeof value==='string'?new TextEncoder().encode(value).byteLength:16),0);
   if(bytes>1900000)fail('An imported record exceeds the supported 1.9 MB database row size. Nothing was imported.');
   statements.push(db.prepare('INSERT INTO '+table+' ('+columns.join(',')+') SELECT '+values.map(()=>'?').join(',')+' WHERE '+guard).bind(...values,p.id,token,startId));
  };
  const event=(action,detail)=>insert('audit',['id','project','action','detail','created'],[uid(),p.id,action,JSON.stringify(detail),time]);
  const comparison=input.project?' AND EXISTS(SELECT 1 FROM projects WHERE id=? AND question IS ? AND criteria IS ? AND allow_search IS ? AND updated IS ?)':'';
  statements.push(db.prepare('INSERT INTO audit(id,project,action,detail,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reference_locks WHERE project=? AND token=?)'+comparison+' AND (SELECT COUNT(*) FROM manuscripts WHERE project=?)+?<=20').bind(startId,p.id,'project.import.started',JSON.stringify({origin:'external export',exported_at:input.exported_at,verification:'not independently verified'}),time,p.id,token,...(input.project?[p.id,p.question,p.criteria,p.allow_search,p.updated]:[]),p.id,(input.manuscripts||[]).length));
  for(const s of sources){
   const key=sourceKey(s),id=keys.get(key)||uid();if(s.id)mapping[s.id]=id;
   if(keys.has(key))continue;keys.set(key,id);added++;
   insert('sources',['id','project','title','doi','url','authors','year','abstract','origin','external_id','pmcid','access','stage','decision','reason','metadata','created'],[id,p.id,s.title,s.doi,s.url,s.authors,s.year,s.abstract,s.origin,s.external_id,s.pmcid,s.access,s.stage,s.decision,s.reason,s.metadata,time]);
  }
  // Replace complete citation identifiers once, avoiding prefix collisions and chained remaps.
  const remap=content=>content.replace(/\[S:([^,\]\s]+)(?=[,\]])/g,(whole,id)=>Object.hasOwn(mapping,id)?'[S:'+mapping[id]:whole);
  for(const d of input.manuscripts||[]){
   const id=uid(),content=remap(d.content);
   if(content.length>200000)fail('Remapped manuscript exceeds the supported length. Nothing was imported.');
   insert('manuscripts',['id','project','title','content','revision','edit_token','created','updated'],[id,p.id,d.title,content,1,uid(),time,time]);
   insert('manuscript_revisions',['document','revision','title','content','created'],[id,1,d.title,content,time]);
   event('manuscript.imported',{id,original_id:d.id,origin:'external draft',revision_history_imported:false});
  }
  for(const n of input.notes||[])insert('notes',['id','project','content','created'],[uid(),p.id,n.content,time]);
  for(const m of input.messages||[]){
   const content=remap(m.content);if(content.length>100000)fail('Remapped conversation exceeds the supported length. Nothing was imported.');
   insert('messages',['id','project','role','content','status','model','created'],[uid(),p.id,['user','assistant','tool'].includes(m.role)?m.role:'tool',content,'imported',m.model||null,time]);
  }
  for(const t of input.tasks||[])insert('tasks',['id','project','kind','args','state','result','error','created','updated'],[uid(),p.id,'external:'+t.kind,JSON.stringify({claimed_parameters:t.args,original_id:t.id}),'imported',JSON.stringify({origin:'externally supplied',verification:'not executed or independently verified by this installation',claimed_state:t.state,claimed_result:t.result}),t.error||null,time,time]);
  for(const c of input.claims||[])insert('claims',['id','project','statement','stance','source_id','file_id','location','quote','status','verification','created'],[uid(),p.id,c.statement,['supports','contradicts','context'].includes(c.stance)?c.stance:'context',mapping[c.source_id]||null,null,c.location||'',c.quote,'unreviewed',JSON.stringify({method:'external import; match not rechecked',original_id:c.id,original_file_id:c.file_id,claimed_verification:c.verification,original_review:c.status}),time]);
  if(input.review_workspace?.revision){
   const data=validateReviewShape(input.review_workspace.data),studyIds=new Map(data.studies.map(s=>[s.id,uid()]));
   for(const study of data.studies){study.id=studyIds.get(study.id);study.sourceIds=study.sourceIds.map(id=>mapping[id]);}
   for(const e of data.extractions){e.id=uid();e.studyId=studyIds.get(e.studyId);e.sourceId=mapping[e.sourceId];e.reviewStatus='unchecked';e.reviewedBy=null;e.reviewedAt=null;e.verification={method:'external import; not rechecked',original_file_id:e.fileId||null,scope:'Externally supplied data. Reassociate original evidence and check before use.'};e.fileId='';}
   // DOI/title deduplication can collapse different external report IDs. Reject
   // a resulting ambiguous study grouping instead of persisting invalid links.
   validateReviewShape(data);
   const content=JSON.stringify(data);if(content.length>REVIEW_LIMITS.characters)fail('Imported review exceeds its supported size after provenance is recorded. Nothing was imported.');
   const hash=await sha(content),reason='Imported external review; evidence and history not independently verified.';
   insert('review_workspaces',['project','data','revision','edit_token','updated'],[p.id,content,1,uid(),time]);
   insert('review_revisions',['project','revision','data','reason','actor','sha256','created'],[p.id,1,content,reason,p.owner,hash,time]);
   event('review.saved',{revision:1,reason,actor:p.owner,sha256:hash,studies:data.studies.length,extractions:data.extractions.length});
  }
  if(input.project)statements.push(db.prepare('UPDATE projects SET question=?,criteria=?,allow_search=?,updated=? WHERE id=? AND '+guard).bind(input.project.question??p.question,input.project.criteria??p.criteria,[0,false].includes(input.project.allow_search)?0:p.allow_search,time,p.id,p.id,token,startId));
  event('project.imported',{added,source_mapping:mapping,origin:'external export',verification:'not independently verified',fileContentsImported:false,external_history:input.audit||[]});
  let results;
  try{results=await db.batch(statements);}catch(error){
   if(String(error.message).includes('review_workspaces.project'))fail('Another review was saved during import. Nothing was imported; choose a new project.',409);
   throw error;
  }
  if(results.at(-1).meta?.changes!==1)fail('The project changed or the import lease expired. Nothing was imported. Reload before retrying the complete export.',409);
  return {added,externalTasks:(input.tasks||[]).length,claims:(input.claims||[]).length,scope:'Project metadata and current drafts only. Original files, full revision history and reviewer access are not restored.'};
 });
}
