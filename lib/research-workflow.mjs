import {all,first,run,json,uid,now,audit,AppError,sourceKey,toCsv} from './core.mjs';
import {withReferenceLock} from './reference-lock.mjs';
import {parseReferences,exportReferences,normalizeReference} from './references.mjs';
import {renderManuscript,documentText,MANUSCRIPT_LIMITS} from './manuscripts.mjs';
const fail=(s,n=400)=>{throw new AppError(s,n)};
const download=(content,name,type)=>new Response(content,{headers:{'Content-Type':type+'; charset=utf-8','Content-Disposition':'attachment; filename="'+name+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function bibliographyPreview(db,project,b){
 let parsed;try{parsed=parseReferences(b.text,b.format)}catch(e){fail(e.message)}
 const existing=await all(db,'SELECT id,title,doi FROM sources WHERE project=?',project),keys=new Map(existing.map(s=>[sourceKey(s),s.id]));
 const entries=parsed.records.map(record=>{const key=sourceKey(record),duplicate=keys.has(key),id=keys.get(key)||uid();keys.set(key,id);return {record,id,duplicate}});
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.text)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 return {...parsed,entries,sha256,added:entries.filter(e=>!e.duplicate).length,duplicates:entries.filter(e=>e.duplicate).length};
}
export function screeningLedger(sources,events){
 const known=new Map(sources.map(s=>[s.id,{source:s,stages:{}}])),searches=[],imports=[];
 for(const e of events){let d;try{d=JSON.parse(e.detail)}catch{continue}
  if(e.action==='screening.decision'&&known.has(d.sourceId)){const stages=known.get(d.sourceId).stages;if(d.previous?.stage&&!stages[d.previous.stage])stages[d.previous.stage]={...d.previous,provenance:'previous recorded state',at:e.created};if(['title_abstract','full_text','analysis'].includes(d.stage))stages[d.stage]={decision:d.decision,reason:d.reason||'',reviewer:d.reviewer||'',at:e.created,provenance:d.origin||'human'};}
  if(e.action==='search.completed')searches.push({at:e.created,...d});
  if(['bibliography.imported','sources.added','project.imported'].includes(e.action))imports.push({at:e.created,action:e.action,...d});
 }
 const rows=[],counts={};
 for(const {source:s,stages} of known.values()){
  stages[s.stage]??={decision:s.decision,reason:s.reason||'',at:s.created,provenance:'current state; complete stage history not established'};
  for(const [stage,d] of Object.entries(stages)){if(!['include','exclude','unknown'].includes(d.decision))continue;counts[stage]??={include:0,exclude:0,unknown:0};counts[stage][d.decision]++;rows.push({source_id:s.id,title:s.title,doi:s.doi||'',stage,...d,current_stage:s.stage});}
 }
 return {schema:'evidarium.screening-ledger.v1',generated_at:new Date().toISOString(),total_records:sources.length,stage_counts:counts,rows,searches,imports,notice:'Bibliographic records, not unique studies. Each stage counts its last recorded state, so the same record may appear in several stages. These are not additive PRISMA flow counts. Missing search, retrieval and study-linkage information is not inferred. Imported history is external and not replayed as verified decisions.'};
}
export async function handleResearchWorkflow(req,{db,readBody},p){
 const u=new URL(req.url),tail=u.pathname.split('/').slice(4),method=req.method;
 if(tail[0]==='bibliography'){
  if(method==='GET'){const format=u.searchParams.get('format')||'csl-json';if(!['csl-json','ris','bibtex'].includes(format))fail('Choose CSL JSON, RIS or BibTeX.');const sources=await all(db,'SELECT * FROM sources WHERE project=? ORDER BY created,id',p.id);return download(exportReferences(sources,format),'evidarium-references.'+({'csl-json':'json',ris:'ris',bibtex:'bib'}[format]),format==='csl-json'?'application/json':'text/plain');}
  if(method==='POST'&&['preview','import'].includes(tail[1])){const b=await readBody();let preview=await bibliographyPreview(db,p.id,b);if(tail[1]==='preview')return json({sha256:preview.sha256,added:preview.added,duplicates:preview.duplicates,warnings:preview.warnings,notice:preview.notice,entries:preview.entries.map(e=>({title:e.record.title,authors:e.record.authors,year:e.record.year,doi:e.record.doi,duplicate:e.duplicate}))});
   return withReferenceLock(db,p.id,async token=>{preview=await bibliographyPreview(db,p.id,b);
   if(b.sha256!==preview.sha256)fail('The import differs from the preview. Preview this file again.',409);
   const time=now(),statements=preview.entries.filter(e=>!e.duplicate).map(({record:s,id})=>db.prepare('INSERT INTO sources (id,project,title,doi,url,authors,year,abstract,origin,external_id,stage,decision,reason,metadata,created) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reference_locks WHERE project=? AND token=?)').bind(id,p.id,s.title,s.doi||null,s.url||null,s.authors,s.year,s.abstract,s.origin,s.external_id||null,'title_abstract','unknown','',s.metadata,time,p.id,token));
   const detail={format:b.format,sha256:preview.sha256,added:preview.added,duplicates:preview.duplicates,ids:preview.entries.map(e=>({id:e.id,duplicate:e.duplicate})),warnings:preview.warnings,origin:'external metadata'};
   statements.push(db.prepare('INSERT INTO audit (id,project,action,detail,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reference_locks WHERE project=? AND token=?)').bind(uid(),p.id,'bibliography.imported',JSON.stringify(detail),time,p.id,token));const applied=await db.batch(statements);if(applied.at(-1).meta?.changes!==1)fail('Import lease expired; no records were added by this request. Preview and retry.',409);return json(detail,201);});
  }
 }
 if(tail[0]==='screening-ledger'&&method==='GET'){const report=screeningLedger(await all(db,'SELECT * FROM sources WHERE project=? ORDER BY created,id',p.id),await all(db,'SELECT * FROM audit WHERE project=? ORDER BY created,rowid',p.id));if(u.searchParams.get('format')==='csv')return download(toCsv(report.rows,['source_id','title','doi','stage','decision','reason','reviewer','at','provenance','current_stage']),'evidarium-screening-ledger.csv','text/csv');return json(report);}
 if(tail[0]!=='manuscripts')return null;
 if(tail.length===1&&method==='GET')return json(await all(db,'SELECT id,title,revision,created,updated FROM manuscripts WHERE project=? ORDER BY updated DESC',p.id));
 if(tail.length===1&&method==='POST'){
  const b=await readBody();let title;try{title=documentText(b.title,200,'Title').trim()}catch(e){fail(e.message)}if(!title)fail('Give the manuscript a title.');
  const id=uid(),time=now(),token=uid();const count=await first(db,'SELECT COUNT(*) n FROM manuscripts WHERE project=?',p.id);if(count.n>=MANUSCRIPT_LIMITS.documents)fail('This project supports up to 20 manuscripts.');
  await db.batch([db.prepare('INSERT INTO manuscripts VALUES (?,?,?,?,?,?,?,?)').bind(id,p.id,title,'',1,token,time,time),db.prepare('INSERT INTO manuscript_revisions VALUES (?,?,?,?,?)').bind(id,1,title,'',time),db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)').bind(uid(),p.id,'manuscript.created',JSON.stringify({id,title,revision:1}),time)]);return json(await first(db,'SELECT * FROM manuscripts WHERE id=?',id),201);
 }
 const d=await first(db,'SELECT * FROM manuscripts WHERE id=? AND project=?',tail[1],p.id);if(!d)fail('Manuscript not found.',404);
 if(tail.length===2&&method==='GET')return json(d);
 if(tail.length===2&&method==='DELETE'){await db.batch([db.prepare('DELETE FROM manuscript_revisions WHERE document=?').bind(d.id),db.prepare("DELETE FROM project_search WHERE project=? AND kind='manuscript' AND record_id=?").bind(p.id,d.id),db.prepare('DELETE FROM manuscripts WHERE id=? AND project=?').bind(d.id,p.id),db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)').bind(uid(),p.id,'manuscript.deleted',JSON.stringify({id:d.id,title:d.title}),now())]);return json({ok:true});}
 if(tail.length===2&&method==='PUT'){
  const b=await readBody();let title,content;try{title=documentText(b.title,200,'Title').trim();content=documentText(b.content,MANUSCRIPT_LIMITS.characters,'Draft')}catch(e){fail(e.message)}if(!title)fail('Give the manuscript a title.');if(!Number.isSafeInteger(b.revision)||b.revision!==d.revision)fail('A newer revision exists. Your draft was not overwritten. Download your unsaved text, then reload the saved version.',409);
  const token=uid(),time=now(),rev=d.revision+1,detail=JSON.stringify({id:d.id,title,revision:rev,characters:content.length});
  const result=await db.batch([db.prepare('UPDATE manuscripts SET title=?,content=?,revision=revision+1,edit_token=?,updated=? WHERE id=? AND project=? AND revision=?').bind(title,content,token,time,d.id,p.id,b.revision),db.prepare('INSERT INTO manuscript_revisions(document,revision,title,content,created) SELECT id,revision,title,content,updated FROM manuscripts WHERE id=? AND edit_token=?').bind(d.id,token),db.prepare('INSERT INTO audit(id,project,action,detail,created) SELECT ?,project,?,?,? FROM manuscripts WHERE id=? AND edit_token=?').bind(uid(),'manuscript.saved',detail,time,d.id,token),db.prepare('DELETE FROM manuscript_revisions WHERE document=? AND revision < (SELECT revision-49 FROM manuscripts WHERE id=? AND edit_token=?)').bind(d.id,d.id,token)]);
  if(result[0].meta?.changes!==1)fail('Another save won this revision. Your text was not overwritten; download it before reloading.',409);return json(await first(db,'SELECT * FROM manuscripts WHERE id=?',d.id));
 }
 if(tail[2]==='revisions'&&method==='GET'){if(tail[3]){const revision=await first(db,'SELECT * FROM manuscript_revisions WHERE document=? AND revision=?',d.id,Number(tail[3]));if(!revision)fail('Revision is outside the retained history.',404);return json(revision)}return json(await all(db,'SELECT revision,title,created FROM manuscript_revisions WHERE document=? ORDER BY revision DESC',d.id));}
 if(tail[2]==='preview'&&method==='POST'){const b=await readBody();try{documentText(b.content,MANUSCRIPT_LIMITS.characters,'Draft');documentText(b.title,200,'Title')}catch(e){fail(e.message)}return json(renderManuscript(b,await all(db,'SELECT * FROM sources WHERE project=?',p.id)));}
 if(tail[2]==='export'&&method==='GET'){const rendered=renderManuscript(d,await all(db,'SELECT * FROM sources WHERE project=?',p.id));const format=u.searchParams.get('format')||'html';if(format==='html')return download(rendered.html,'evidarium-manuscript.html','text/html');if(format==='markdown')return download(rendered.markdown,'evidarium-manuscript.md','text/markdown');if(format==='source')return download(JSON.stringify({schema:'evidarium.manuscript.v1',...d,...{edit_token:undefined},citation_report:{issues:rendered.issues,references:rendered.references,notice:rendered.notice}},null,2),'evidarium-manuscript.json','application/json');fail('Choose HTML, Markdown or source JSON.');}
 return null;
}
