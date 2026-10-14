/** Europe PMC is the only remote full-text destination. No arbitrary URL fetches. */
import {SaxesParser} from 'saxes';
import {AppError,all,first,run,audit,uid,now,normalizeDoi,clean} from './core.mjs';
const BASE='https://www.ebi.ac.uk/europepmc/webservices/rest/';
const XML_LIMIT=6*1024**2;
const fail=(message,status=400)=>{throw new AppError(message,status)};
export async function boundedResponse(response,maxBytes){
 if(!response.ok)fail(response.status===404?'Open-access full text is unavailable for this record.':'Europe PMC could not complete the request.',response.status===404?404:502);
 if(Number(response.headers.get('content-length')||0)>maxBytes)fail('The provider response exceeds the supported import size.',413);
 const reader=response.body?.getReader();if(!reader)fail('The provider returned no content.',502);
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)fail('The provider response exceeds the supported import size.',413);chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length}return bytes;
}
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c<=0x10ffff?String.fromCodePoint(c):'�'}).replace(/\s+/g,' ').trim();
async function records(query,fetcher=fetch,pageSize=20){
 const url=BASE+'search?format=json&resultType=core&pageSize='+pageSize+'&query='+encodeURIComponent(query);
 const bytes=await boundedResponse(await fetcher(url,{signal:AbortSignal.timeout(25000),redirect:'error'}),4*1024**2);
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{fail('Europe PMC returned invalid metadata.',502)}
 return data.resultList?.result||[];
}
export async function searchEuropePmc(query,fetcher=fetch){return(await records(query,fetcher)).map(s=>({title:plain(s.title),doi:s.doi||'',url:s.pmcid?'https://europepmc.org/articles/'+s.pmcid:'https://europepmc.org/article/'+s.source+'/'+s.id,authors:s.authorString||'',year:Number(s.pubYear)||null,abstract:plain(s.abstractText),origin:'Europe PMC',external_id:s.source+':'+s.id,pmcid:s.pmcid||null,access:s.isOpenAccess==='Y'?'open_access':'unknown'}))}
export function parseJats(xml){
 if(new TextEncoder().encode(xml).length>XML_LIMIT)fail('Article XML exceeds 6 MiB.',413);
 const parser=new SaxesParser(),stack=[],segments=[];let characters=0,omitted=0,pmcid='',doi='',license='',articleTitle='',paragraph=0,bodySeen=false,buffered=0;
 const normalize=s=>s.replace(/\s+/g,' ').trim();
 parser.on('opentag',node=>{if(stack.length>=128)fail('XML nesting exceeds the supported depth.');const name=node.name.split(':').pop();stack.push({name,attrs:node.attributes,text:'',capture:['article-id','article-title','license','p','tr','title'].includes(name)});if(name==='body')bodySeen=true});
 const text=t=>{for(const frame of stack)if(frame.capture){buffered+=t.length;if(buffered>12*1024**2)fail('Article text exceeds the parser memory bound.',413);frame.text+=t}};parser.on('text',text);parser.on('cdata',text);
 parser.on('closetag',()=>{
  const frame=stack.pop(),value=normalize(frame.text),ancestors=stack.map(x=>x.name),parent=stack.at(-1);
  if(['p','title','tr','td','th','label'].includes(frame.name))text(' ');
  const inMeta=ancestors.includes('article-meta'),inText=ancestors.includes('body')||ancestors.includes('abstract');
  if(frame.name==='article-id'&&inMeta){if(['pmc','pmcid'].includes(frame.attrs['pub-id-type']))pmcid='PMC'+value.replace(/^PMC/i,'');if(frame.attrs['pub-id-type']==='doi')doi=value}
  if(frame.name==='article-title'&&inMeta&&!articleTitle)articleTitle=value;
  if(frame.name==='license'&&inMeta)license=value;
  if(inText&&['title','p','tr'].includes(frame.name)&&!ancestors.includes('ref-list')&&!ancestors.includes('p')&&!(frame.name==='p'&&ancestors.includes('table'))&&value){
   paragraph++;if(characters+value.length>240000||segments.length>=2000){omitted++;return}
   const type=ancestors.includes('abstract')?'abstract':frame.name==='tr'?'table row':frame.name==='title'?'heading':'paragraph';
   segments.push({location:`JATS ${type} ${paragraph}`,text:value});characters+=value.length;
  }
 });
 try{parser.write(xml).close()}catch(e){if(e instanceof AppError)throw e;fail('The article XML could not be parsed safely: '+String(e.message).slice(0,180),422)}
 if(!bodySeen||!segments.length)fail('The response does not contain a readable article body.',422);
 return {segments,characters,complete:omitted===0,method:'JATS XML: abstract, body paragraphs, headings, and flattened table rows',warnings:['Figures, equation layout, references, and supplementary files are not interpreted. Table rows are plain text; inspect the original XML for structure.',...(omitted?[`${omitted} blocks omitted by the 240,000-character / 2,000-block extraction bound.`]:[])],pmcid,doi,title:articleTitle,license:license||'License not stated in parsed article metadata; consult the publisher.',coverage:{body_seen:bodySeen,omitted_blocks:omitted,original_format:'JATS XML'}};
}
export async function importOpenArticle({db,bucket,project,owner,sourceId,fetcher=fetch}){
 const source=await first(db,'SELECT * FROM sources WHERE id=? AND project=?',sourceId,project.id);if(!source)fail('Source not found.',404);
 const existing=await first(db,'SELECT id FROM files WHERE project=? AND source_id=?',project.id,sourceId);if(existing)return {id:existing.id,duplicate:true};
 if(!project.allow_search)fail('External requests are disabled in this project brief.',409);

 let record;
 if(source.pmcid&&/^PMC\d+$/.test(source.pmcid))record=(await records('EXT_ID:'+source.pmcid+' AND SRC:PMC',fetcher,2)).find(x=>x.pmcid===source.pmcid);
 if(!record&&normalizeDoi(source.doi))record=(await records('DOI:"'+normalizeDoi(source.doi).replace(/["\\]/g,'')+'"',fetcher,5)).find(x=>normalizeDoi(x.doi)===normalizeDoi(source.doi));
 if(!record&&source.origin==='PubMed'&&/^\d+$/.test(source.external_id||''))record=(await records('EXT_ID:'+source.external_id+' AND SRC:MED',fetcher,2)).find(x=>String(x.id)===source.external_id&&x.source==='MED');
 if(!record?.pmcid||!/^PMC\d+$/.test(record.pmcid)||record.isOpenAccess!=='Y')fail('No downloadable open-access article was identified. Upload a copy you have permission to use instead.',404);
 const url=BASE+record.pmcid+'/fullTextXML';const bytes=await boundedResponse(await fetcher(url,{signal:AbortSignal.timeout(30000),redirect:'error'}),XML_LIMIT);
 const extraction=parseJats(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(extraction.pmcid&&extraction.pmcid!==record.pmcid)fail('The article identifier did not match the requested paper.',422);
 if(source.doi&&extraction.doi&&normalizeDoi(source.doi)!==normalizeDoi(extraction.doi))fail('The article DOI did not match the saved source.',422);
 const count=await first(db,'SELECT COUNT(*) AS n FROM files WHERE project=?',project.id),usage=await first(db,'SELECT COALESCE(SUM(files.size),0) AS n FROM files JOIN projects ON files.project=projects.id WHERE projects.owner=?',owner);
 if(count.n>=200||usage.n+bytes.length>8*1024**3)fail('The project or account file allowance is reached.',413);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const id=uid(),key=owner+'/'+project.id+'/'+id,provenance={origin:'Europe PMC open-access XML',article_title:extraction.title,url,pmcid:record.pmcid,doi:record.doi||extraction.doi,retrieved_at:new Date().toISOString(),sha256:hash,license:extraction.license};
 await bucket.put(key,bytes);
 try{await run(db,'INSERT INTO files (id,project,name,mime,size,key,status,parts,extracted,sha256,source_id,provenance,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',id,project.id,record.pmcid+'.xml','application/xml',bytes.length,key,extraction.complete?'extracted':'partial','[]',JSON.stringify(extraction),hash,source.id,JSON.stringify(provenance),now())}catch(e){await bucket.delete(key);const duplicate=await first(db,'SELECT id FROM files WHERE project=? AND source_id=?',project.id,sourceId);if(duplicate)return {id:duplicate.id,duplicate:true};throw e}
 await audit(db,project.id,'article.imported',{fileId:id,sourceId:source.id,...provenance,characters:extraction.characters,warnings:extraction.warnings});
 return {id,characters:extraction.characters,warnings:extraction.warnings,provenance};
}
