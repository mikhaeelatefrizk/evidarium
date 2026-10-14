/** Durable FTS5 retrieval. Scores rank text relevance, never scientific validity. */
import selects from './search-selects.json' with {type:'json'};
import {all,first,now,AppError} from './core.mjs';
const STOP=new Set('the and that this with from have what which where when would could should about please your their there were been into does evidence research paper papers'.split(' '));
export function queryTerms(query){return [...new Set((String(query).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(x=>!STOP.has(x)))].slice(0,32)}
export async function ensureSearchIndex(db,project){
 if((await first(db,'SELECT revision FROM search_indexes WHERE project=?',project))?.revision===1)return;
 const statements=[db.prepare('DELETE FROM project_search WHERE project=?').bind(project),...Object.values(selects).map(sql=>db.prepare('INSERT INTO project_search (project,kind,record_id,location,title,text) '+sql).bind(project)),db.prepare('INSERT INTO search_indexes (project,revision,indexed) VALUES (?,1,?) ON CONFLICT(project) DO UPDATE SET revision=1,indexed=excluded.indexed').bind(project,now())];
 await db.batch(statements);
}
export async function searchProject(db,project,query,{kind='all',limit=12,offset=0}={}){
 if(!['all','source','file','conversation','note','analysis','claim'].includes(kind))throw new AppError('Unknown record type.');
 const terms=queryTerms(query);if(!terms.length)return {query,results:[],coverage:{method:'FTS5 BM25 keyword retrieval',note:'Enter a specific term; generic words are ignored.'},has_more:false};
 await ensureSearchIndex(db,project);
 const match=terms.map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR '),filter=kind==='all'?'':' AND kind=?',args=[match,project,...(kind==='all'?[]:[kind])];
 limit=Math.max(1,Math.min(50,Number(limit)||12));offset=Math.max(0,Math.min(10000,Number(offset)||0));
 const rows=await all(db,`SELECT kind AS type,record_id AS id,location,title,snippet(project_search,5,'','',' … ',48) AS text FROM project_search WHERE project_search MATCH ? AND project=?${filter} ORDER BY bm25(project_search,0,0,0,0,2,1),rowid LIMIT ? OFFSET ?`,...args,limit+1,offset);
 const counts=await all(db,'SELECT kind,COUNT(*) AS n FROM project_search WHERE project=? GROUP BY kind',project);
 return {query,results:rows.slice(0,limit).map(x=>({...x,name:x.title,verification:{source:'Stored bibliographic metadata or abstract; not full article text',file:'Extracted text; inspect coverage and original',conversation:'Conversation record; not independent evidence',note:'User-supplied note',analysis:'Recorded result; external imports are not independently verified',claim:'Recorded claim; inspect the human review status'}[x.type]})),has_more:rows.length>limit,offset,next_offset:offset+limit,coverage:{method:'FTS5 BM25 keyword retrieval',indexed_records:Object.fromEntries(counts.map(x=>[x.kind,x.n])),result_limit:limit,note:'All indexed history is searchable. This is lexical retrieval, not semantic understanding or a complete reading. Snippets may omit text between matches.'}};
}
