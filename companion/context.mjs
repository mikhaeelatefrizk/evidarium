import {all,first} from '../lib/core.mjs';
const words=q=>[...new Set(String(q).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].slice(0,30);
export function ranked(items,query,limit=12){const terms=words(query);return items.map((x,i)=>({...x,_score:terms.reduce((n,t)=>n+((x.text||'').toLowerCase().includes(t)?1:0),0),_order:i})).filter(x=>!terms.length||x._score>0).sort((a,b)=>b._score-a._score||a._order-b._order).slice(0,limit).map(({_score,_order,...x})=>x)}
export async function evidenceSearch(db,id,query){
 const records=[];
 for(const s of await all(db,'SELECT * FROM sources WHERE project=?',id))records.push({type:'source',id:s.id,location:'bibliographic metadata',text:s.title+'\n'+s.authors+'\n'+s.abstract,url:s.url,doi:s.doi,decision:s.decision,full_text_available:false});
 for(const f of await all(db,'SELECT id,name,extracted FROM files WHERE project=? AND extracted IS NOT NULL',id)){
  let d;try{d=JSON.parse(f.extracted)}catch{continue}
  for(const segment of d.segments||[]){const t=segment.text||'';for(let n=0;n<t.length;n+=1800)records.push({type:'file',id:f.id,name:f.name,location:segment.location+', characters '+n+'–'+Math.min(n+2200,t.length),text:t.slice(n,n+2200),extraction_warnings:d.warnings})}
 }
 for(const n of await all(db,'SELECT id,content FROM notes WHERE project=?',id))records.push({type:'note',id:n.id,text:n.content.slice(0,8000),verification:'user supplied'});
 for(const m of await all(db,'SELECT id,role,content FROM messages WHERE project=? ORDER BY created DESC LIMIT 2000',id))records.push({type:'conversation',id:m.id,text:m.content.slice(0,5000),role:m.role,verification:'conversation record, not independent evidence'});
 for(const t of await all(db,"SELECT id,kind,result,state FROM tasks WHERE project=? AND state IN ('completed','imported') ORDER BY created DESC LIMIT 100",id))records.push({type:'analysis',id:t.id,kind:t.kind,text:t.result?.slice(0,12000)||'',verification:t.state==='imported'?'externally supplied; not independently executed or verified':'recorded local execution, interpretation requires review'});
 return {query,results:ranked(records,query).map(x=>({...x,text:x.text.slice(0,6000)})),coverage:{candidate_chunks:records.length,method:'literal term overlap; at most 12 matches; no semantic or exhaustive retrieval guarantee'}};
}
export async function chatContext(db,p,text){
 const history=await all(db,"SELECT role,content FROM messages WHERE project=? AND role IN ('user','assistant') ORDER BY created DESC,rowid DESC LIMIT 24",p.id);history.reverse();let budget=48000;const recent=[];
 for(const m of history.reverse()){if(budget<=0)break;const v=m.content.slice(-Math.min(12000,budget));recent.unshift({role:m.role,content:v});budget-=v.length}
 const sources=await first(db,'SELECT COUNT(*) AS n FROM sources WHERE project=?',p.id);
 const files=await all(db,'SELECT id,name,size,status,CASE WHEN extracted IS NOT NULL THEN 1 ELSE 0 END AS extracted FROM files WHERE project=?',p.id);
 return {history:recent,context:{question:p.question,criteria:p.criteria,files,saved_source_count:sources.n,evidence:await evidenceSearch(db,p.id,text),coverage:{recent_messages:recent.length,history_characters:48000-budget,history_limit:24,retrieval:'term-overlap selection, not a complete reading of the project'}}};
}
