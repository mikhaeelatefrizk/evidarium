import {bibliographyLabel,referenceCsl,nameText} from './references.mjs';
export const MANUSCRIPT_LIMITS={characters:200000,documents:20,revisions:50};
export const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function documentText(value,max,label){if(typeof value!=='string'||value.length>max)throw Error(`${label} must be text of at most ${max.toLocaleString('en-US')} characters.`);return value;}
export function renderManuscript(document,sources,locale='en'){
 const ar=locale==='ar',language=ar?'ar':'en',direction=ar?'rtl':'ltr',autoDir=ar?' dir="auto"':'',text=(en,arabic)=>ar?arabic:en;
 const referenceLabel=source=>{if(!ar)return bibliographyLabel(source);const c=referenceCsl(source);return [(c.author||[]).map(nameText).join('; ')||'لم يُسجّل المؤلف',c.issued?.['date-parts']?.[0]?.[0]||'لم يُسجّل التاريخ',c.title,c['container-title'],[c.volume,c.issue&&'('+c.issue+')',c.page].filter(Boolean).join(' '),c.DOI?'doi:'+c.DOI:c.URL].filter(Boolean).join('. ')};
 const lookup=new Map(sources.map(s=>[s.id,s])),numbers=new Map(),issues=new Set();
 const converted=document.content.replace(/\[S:([^\]\r\n]+)\]/g,(raw,token)=>{const id=token.split(',')[0].trim(),source=lookup.get(id);if(!source){issues.add(text('Unknown source citation: ','استشهاد بمصدر غير معروف: ')+raw);return raw}if(!numbers.has(id))numbers.set(id,numbers.size+1);if(source.decision==='exclude')issues.add(text('Cites an excluded record: ','يستشهد بسجل مستبعد: ')+source.title);return '['+numbers.get(id)+']';});
 if(/\[F:/.test(document.content))issues.add(text('File citations remain literal; link the file to a saved bibliographic record for a reference-list entry.','تبقى استشهادات الملفات كما هي؛ اربط الملف بسجل مرجعي محفوظ لإضافته إلى قائمة المراجع.'));
 const references=[...numbers.keys()].map(id=>({number:numbers.get(id),id,label:referenceLabel(lookup.get(id))}));
 const blocks=[];let para=[],list=null,code=null;
 const flush=()=>{if(para.length){blocks.push('<p'+autoDir+'>'+escapeHtml(para.join('\n')).replaceAll('\n','<br>')+'</p>');para=[]}if(list){blocks.push('<'+list.type+'>'+list.items.map(x=>'<li'+autoDir+'>'+escapeHtml(x)+'</li>').join('')+'</'+list.type+'>');list=null}};
 for(const line of converted.split('\n')){
  if(/^```/.test(line)){flush();if(code!==null){blocks.push('<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>');code=null}else code=[];continue;}
  if(code!==null){code.push(line);continue;}
  const heading=line.match(/^(#{1,6})\s+(.+)$/),li=line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
  if(heading){flush();const level=heading[1].length;blocks.push('<h'+level+autoDir+'>'+escapeHtml(heading[2])+'</h'+level+'>');}
  else if(li){if(para.length)flush();const type=/\d/.test(li[1])?'ol':'ul';if(list&&list.type!==type)flush();list??={type,items:[]};list.items.push(li[2]);}
  else if(!line.trim())flush();else{if(list)flush();para.push(line);}
 }
 flush();if(code!==null){blocks.push('<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>');issues.add(text('An unclosed code fence was rendered as code.','عُرض مقطع برمجي غير مغلق كنص برمجي.'));}
 const referenceHeading=text('References','المراجع');
 const referenceHtml=references.length?'<section><h2>'+referenceHeading+'</h2><ol>'+references.map(r=>'<li'+autoDir+'>'+escapeHtml(r.label)+'</li>').join('')+'</ol></section>':'';
 const notice=text('Draft by the researcher. Numbered citations establish record links, not scientific support. Bibliography uses a basic numbered format, not a journal-certified citation style.','هذه مسودة أعدّها الباحث. تربط الاستشهادات المرقمة بالسجلات ولا تثبت الدعم العلمي. تستخدم قائمة المراجع تنسيقًا رقميًا أساسيًا لا نمط استشهاد معتمدًا من مجلة.');
 const html='<!doctype html><html lang="'+language+'" dir="'+direction+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+escapeHtml(document.title)+'</title><style>body{max-width:760px;margin:40px auto;padding:0 24px;color:#172b28;background:white;font:17px/1.7 Georgia,serif}h1,h2,h3{line-height:1.3}pre{direction:ltr;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f4;padding:16px}li,p{overflow-wrap:anywhere}aside{font:13px/1.5 system-ui;color:#52645e;border-top:1px solid #ddd;margin-top:32px;padding-top:12px}@media print{body{margin:0;max-width:none}h1,h2,h3{break-after:avoid}pre{break-inside:avoid}}</style></head><body><h1'+autoDir+'>'+escapeHtml(document.title)+'</h1>'+blocks.join('\n')+referenceHtml+'<aside>'+escapeHtml(notice)+(issues.size?'<ul>'+[...issues].map(i=>'<li>'+escapeHtml(i)+'</li>').join('')+'</ul>':'')+'</aside></body></html>';
 return {html,markdown:'# '+document.title+'\n\n'+converted+(references.length?'\n\n## '+referenceHeading+'\n\n'+references.map(r=>r.number+'. '+r.label).join('\n'):'')+'\n',references,issues:[...issues],notice};
}
