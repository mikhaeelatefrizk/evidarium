import {bibliographyLabel} from './references.mjs';
export const MANUSCRIPT_LIMITS={characters:200000,documents:20,revisions:50};
export const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function documentText(value,max,label){if(typeof value!=='string'||value.length>max)throw Error(`${label} must be text of at most ${max.toLocaleString('en-US')} characters.`);return value;}
export function renderManuscript(document,sources){
 const lookup=new Map(sources.map(s=>[s.id,s])),numbers=new Map(),issues=new Set();
 const converted=document.content.replace(/\[S:([^\]\r\n]+)\]/g,(raw,token)=>{const id=token.split(',')[0].trim(),source=lookup.get(id);if(!source){issues.add('Unknown source citation: '+raw);return raw}if(!numbers.has(id))numbers.set(id,numbers.size+1);if(source.decision==='exclude')issues.add('Cites an excluded record: '+source.title);return '['+numbers.get(id)+']';});
 if(/\[F:/.test(document.content))issues.add('File citations remain literal; link the file to a saved bibliographic record for a reference-list entry.');
 const references=[...numbers.keys()].map(id=>({number:numbers.get(id),id,label:bibliographyLabel(lookup.get(id))}));
 const blocks=[];let para=[],list=null,code=null;
 const flush=()=>{if(para.length){blocks.push('<p>'+escapeHtml(para.join('\n')).replaceAll('\n','<br>')+'</p>');para=[]}if(list){blocks.push('<'+list.type+'>'+list.items.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</'+list.type+'>');list=null}};
 for(const line of converted.split('\n')){
  if(/^```/.test(line)){flush();if(code!==null){blocks.push('<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>');code=null}else code=[];continue;}
  if(code!==null){code.push(line);continue;}
  const heading=line.match(/^(#{1,6})\s+(.+)$/),li=line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
  if(heading){flush();const level=heading[1].length;blocks.push('<h'+level+'>'+escapeHtml(heading[2])+'</h'+level+'>');}
  else if(li){if(para.length)flush();const type=/\d/.test(li[1])?'ol':'ul';if(list&&list.type!==type)flush();list??={type,items:[]};list.items.push(li[2]);}
  else if(!line.trim())flush();else{if(list)flush();para.push(line);}
 }
 flush();if(code!==null){blocks.push('<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>');issues.add('An unclosed code fence was rendered as code.');}
 const referenceHtml=references.length?'<section><h2>References</h2><ol>'+references.map(r=>'<li>'+escapeHtml(r.label)+'</li>').join('')+'</ol></section>':'';
 const notice='Draft by the researcher. Numbered citations establish record links, not scientific support. Bibliography uses a basic numbered format, not a journal-certified citation style.';
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+escapeHtml(document.title)+'</title><style>body{max-width:760px;margin:40px auto;padding:0 24px;color:#172b28;background:white;font:17px/1.7 Georgia,serif}h1,h2,h3{line-height:1.3}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f4;padding:16px}li,p{overflow-wrap:anywhere}aside{font:13px/1.5 system-ui;color:#52645e;border-top:1px solid #ddd;margin-top:32px;padding-top:12px}@media print{body{margin:0;max-width:none}h1,h2,h3{break-after:avoid}pre{break-inside:avoid}}</style></head><body><h1>'+escapeHtml(document.title)+'</h1>'+blocks.join('\n')+referenceHtml+'<aside>'+escapeHtml(notice)+(issues.size?'<ul>'+[...issues].map(i=>'<li>'+escapeHtml(i)+'</li>').join('')+'</ul>':'')+'</aside></body></html>';
 return {html,markdown:'# '+document.title+'\n\n'+converted+(references.length?'\n\n## References\n\n'+references.map(r=>r.number+'. '+r.label).join('\n'):'')+'\n',references,issues:[...issues],notice};
}
