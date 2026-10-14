import {first} from './core.mjs';
/** Check reference existence and evidence access, not entailment or research truth. */
export async function checkCitations(db,project,text,{seen}={}){
 const matches=[...String(text).matchAll(/\[([SF]):([^\],]+)(?:,\s*([^\]]+))?\]/g)];
 const references=[];const unique=new Set();
 for(const match of matches.slice(0,200)){
  const [citation,kind,id,rawLocation]=match,location=rawLocation?.trim()||'',key=kind+':'+id+':'+location;if(unique.has(key))continue;unique.add(key);
  let status='',detail='';
  const row=await first(db,kind==='S'?'SELECT id,abstract FROM sources WHERE id=? AND project=?':'SELECT id,extracted FROM files WHERE id=? AND project=?',id,project);
  if(!row){status='missing';detail='No matching record exists in this project.'}
  else if(kind==='S'){
   if(seen&&!seen.has('S:'+id)){status='not_in_context';detail='This record was not supplied to this model run.'}
   else {status=row.abstract?'abstract_available':'metadata_only';detail=row.abstract?'An excerpt of the saved abstract was available; support for this claim was not checked.':'Only bibliographic metadata was available; it cannot establish a scientific finding.'}
  }else if(!location){status='missing_location';detail='The citation needs the exact extracted-text location.'}
  else {
   let segments=[];try{segments=JSON.parse(row.extracted||'{}').segments||[]}catch{}
   if(!segments.some(x=>x.location===location)){status='missing_location';detail='That location is not present in the stored extraction.'}
   else if(seen&&!seen.has('F:'+id+':'+location)){status='not_in_context';detail='That passage was not supplied to this model run.'}
   else {status='passage_available';detail='The reference resolves to an available extracted location. Its interpretation still requires review.'}
  }
  references.push({citation,kind,id,location,status,detail});
 }
 const issues=references.filter(x=>!['abstract_available','passage_available'].includes(x.status)).length;
 return {checked_at:new Date().toISOString(),method:'Reference and access checks; not claim entailment',references,issues,scope:seen?'Evidence delivered during this model run':'Current stored project evidence; model access not checked',limit_reached:matches.length>200,notice:references.length?'A resolving citation does not prove the surrounding claim.':'No Evidarium-format citations were found; this is not a verified answer.'};
}
