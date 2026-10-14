import {all,first} from '../lib/core.mjs';
const words=q=>[...new Set(String(q).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].slice(0,30);
export function ranked(items,query,limit=12){const terms=words(query);return items.map((x,i)=>({...x,_score:terms.reduce((n,t)=>n+((x.text||'').toLowerCase().includes(t)?1:0),0),_order:i})).filter(x=>!terms.length||x._score>0).sort((a,b)=>b._score-a._score||a._order-b._order).slice(0,limit).map(({_score,_order,...x})=>x)}
export {searchProject as evidenceSearch} from '../lib/retrieval.mjs';
import {searchProject as evidenceSearch} from '../lib/retrieval.mjs';
export async function chatContext(db,p,text){
 const history=await all(db,"SELECT role,content FROM messages WHERE project=? AND role IN ('user','assistant') ORDER BY created DESC,rowid DESC LIMIT 24",p.id);history.reverse();let budget=48000;const recent=[];
 for(const m of history.reverse()){if(budget<=0)break;const v=m.content.slice(-Math.min(12000,budget));recent.unshift({role:m.role,content:v});budget-=v.length}
 const sources=await first(db,'SELECT COUNT(*) AS n FROM sources WHERE project=?',p.id);
 const files=await all(db,'SELECT id,name,size,status,CASE WHEN extracted IS NOT NULL THEN 1 ELSE 0 END AS extracted FROM files WHERE project=?',p.id);
 return {history:recent,context:{question:p.question,criteria:p.criteria,files,saved_source_count:sources.n,evidence:await evidenceSearch(db,p.id,text),coverage:{recent_messages:recent.length,history_characters:48000-budget,history_limit:24,retrieval:'FTS5 BM25 across indexed history; not a complete reading of the project'}}};
}
