/** Offline bibliographic interchange. No identifiers or URLs trigger network requests. */
export const REFERENCE_LIMITS = {bytes: 1024 * 1024, records: 200};
const text = (v, max = 50000) => { if (v == null) return ''; if (typeof v !== 'string' && typeof v !== 'number') throw Error('A bibliographic text field has an invalid type.'); const s=String(v).trim(); if(s.length>max)throw Error('A bibliographic field is too long.'); return s; };
const http = v => {try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const doi = v => text(v,300).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').toLowerCase();
const types = {JOUR:'article-journal',JFULL:'article-journal',BOOK:'book',CHAP:'chapter',CONF:'paper-conference',CPAPER:'paper-conference',THES:'thesis',RPRT:'report',ELEC:'webpage',GEN:'article'};
const fields=['title','container-title','volume','issue','page','publisher','publisher-place','edition','ISBN','ISSN','language','abstract','note'];
export function normalizeReference(item,index=0){
 if(!item||typeof item!=='object'||Array.isArray(item))throw Error(`Record ${index+1} is not a bibliographic object.`);
 const csl={type:text(item.type||'article',80)};
 for(const k of fields)if(item[k]!=null)csl[k]=text(item[k],k==='abstract'||k==='note'?50000:k==='title'?2000:3000);
 if(!csl.title)throw Error(`Record ${index+1} has no title. Nothing was imported.`);
 csl.DOI=doi(item.DOI);csl.URL=http(text(item.URL,4000));
 if(item.author!==undefined){if(!Array.isArray(item.author)||item.author.length>300)throw Error('Authors must be a list of at most 300 names.');csl.author=item.author.map(a=>{if(!a||typeof a!=='object')throw Error('Invalid author.');const name={};for(const k of ['family','given','literal','suffix','non-dropping-particle','dropping-particle'])if(a[k]!=null)name[k]=text(a[k],500);if(!name.family&&!name.literal&&!name.given)throw Error('An author has no name.');return name;});}
 const parts=item.issued?.['date-parts'];
 if(parts!==undefined){if(!Array.isArray(parts)||!Array.isArray(parts[0])||parts[0].length<1||parts[0].length>3||parts.length>2||parts.some(p=>!Array.isArray(p)||p.some(n=>!Number.isInteger(n))))throw Error('Invalid publication date.');for(const p of parts)if(p[0]<1||p[0]>9999||(p[1]!=null&&(p[1]<1||p[1]>12))||(p[2]!=null&&(p[2]<1||p[2]>31)))throw Error('Publication date is outside supported bounds.');csl.issued={'date-parts':parts};}
 if(item.issued?.literal)csl.issued={...(csl.issued||{}),literal:text(item.issued.literal,200)};
 const authors=(csl.author||[]).map(nameText).join('; ');if(authors.length>3000)throw Error('Author display exceeds 3,000 characters.');
 return {title:csl.title,doi:csl.DOI,url:csl.URL,authors,year:parts?.[0]?.[0]||null,abstract:csl.abstract||'',origin:'Bibliography import',external_id:text(item.id,200),metadata:JSON.stringify({csl})};
}
export function nameText(a){return a.literal||[a['non-dropping-particle'],a.family,a.given,a.suffix].filter(Boolean).join(' ')}
function parseRis(raw){
 const records=[];let tags=null,last=null;
 for(const [i,line] of raw.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').replaceAll('\r','\n').split('\n').entries()){
  if(!line.trim())continue;const match=line.match(/^([A-Z0-9]{2}) {2}- ?(.*)$/);
  if(!match){if(tags&&last&&/^\s/.test(line)){tags[last][tags[last].length-1]+='\n'+line.trim();continue}throw Error(`Invalid RIS line ${i+1}; use a standard RIS export.`)}
  const [,key,value]=match;
  if(key==='TY'){if(tags)throw Error('A RIS record is missing ER.');tags=Object.create(null);tags.TY=[value];last='TY';}
  else if(key==='ER'){if(!tags)throw Error('RIS ER appears before TY.');records.push(tags);tags=null;last=null;if(records.length>REFERENCE_LIMITS.records)throw Error('Import at most 200 references at a time.');}
  else {if(!tags)throw Error('RIS records must begin with TY.');(tags[key]??=[]).push(value);last=key;}
 }
 if(tags)throw Error('The final RIS record is missing ER.');
 const handled=new Set('TY TI T1 CT AU A1 PY Y1 DA DO UR AB N2 JO JF T2 VL IS SP EP PB CY ET SN LA N1 ID ER'.split(' ')),warnings=new Set();
 const items=records.map(t=>{for(const key of Object.keys(t))if(!handled.has(key))warnings.add(`RIS ${key} is not mapped; keep your original export.`);if(!types[t.TY[0]])warnings.add(`RIS type ${t.TY[0]} is exported as a generic article.`);const one=(...keys)=>keys.map(k=>t[k]?.[0]).find(Boolean)||'';
  const date=one('PY','Y1','DA').match(/\b(\d{4})\b/),year=date?Number(date[1]):null;
  return {id:one('ID'),type:types[t.TY[0]]||'article',title:one('TI','T1','CT'),author:(t.AU||t.A1||[]).map(n=>{const at=n.indexOf(',');return at<0?{literal:n}:{family:n.slice(0,at).trim(),given:n.slice(at+1).trim()}}),issued:year?{'date-parts':[[year]]}:undefined,DOI:one('DO'),URL:one('UR'),abstract:one('AB','N2'),'container-title':one('JO','JF','T2'),volume:one('VL'),issue:one('IS'),page:[one('SP'),one('EP')].filter(Boolean).join('-'),publisher:one('PB'),'publisher-place':one('CY'),edition:one('ET'),...(t.TY[0]==='BOOK'||t.TY[0]==='CHAP'?{ISBN:one('SN')}:{ISSN:one('SN')}),language:one('LA'),note:(t.N1||[]).join('\n')};
 });return {items,warnings:[...warnings]};
}
export function parseReferences(raw,format){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>REFERENCE_LIMITS.bytes)throw Error('Bibliography imports are limited to 1 MiB.');
 let items,warnings=[];
 if(format==='ris')({items,warnings}=parseRis(raw));
 else if(format==='csl-json'){try{items=JSON.parse(raw.replace(/^\uFEFF/,''))}catch{throw Error('Invalid CSL JSON.')}if(!Array.isArray(items))throw Error('CSL JSON must be an array of bibliography records.');warnings.push('Only documented citation fields are mapped. Attachments, collections, tags and unsupported CSL fields are not imported.');}
 else throw Error('Choose RIS or CSL JSON.');
 if(!items.length||items.length>REFERENCE_LIMITS.records)throw Error('Import between 1 and 200 references.');
 return {records:items.map(normalizeReference),warnings,notice:'Imported metadata is externally supplied, not verified evidence. Duplicate records retain existing metadata and decisions.'};
}
export function referenceCsl(source){
 let stored={};try{stored=JSON.parse(source.metadata||'{}').csl||{}}catch{}
 const csl=JSON.parse(normalizeReference({...stored,title:source.title,DOI:source.doi||stored.DOI,URL:source.url||stored.URL,abstract:source.abstract||stored.abstract}).metadata).csl;
 if(!csl.author?.length&&source.authors)csl.author=[{literal:source.authors}];
 if(!csl.issued&&source.year)csl.issued={'date-parts':[[source.year]]};
 return {id:source.id,...csl};
}
const line=v=>String(v??'').replace(/[\r\n\u0000]/g,' ').trim();
const tex=v=>String(v??'').replace(/[\\{}#$%&_~^]/g,c=>({'\\':'\\textbackslash{}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]||'\\'+c)).replace(/[\r\n\u0000]/g,' ');
export function exportReferences(sources,format){
 const records=sources.map(referenceCsl);
 if(format==='csl-json')return JSON.stringify(records,null,2);
 if(format==='ris')return records.map(c=>{const r=[['TY',Object.entries(types).find(([,v])=>v===c.type)?.[0]||'GEN'],['ID',c.id],['TI',c.title],...(c.author||[]).map(a=>['AU',a.literal||[[a['non-dropping-particle'],a.family].filter(Boolean).join(' '),a.given,a.suffix].filter(Boolean).join(', ')]),['PY',c.issued?.['date-parts']?.[0]?.[0]],['DO',c.DOI],['UR',c.URL],['JO',c['container-title']],['VL',c.volume],['IS',c.issue],['SP',c.page],['PB',c.publisher],['CY',c['publisher-place']],['SN',c.ISBN||c.ISSN],['ET',c.edition],['LA',c.language],['AB',c.abstract],['N1',c.note]];return r.filter(([,v])=>v!=null&&String(v)!=='').map(([k,v])=>k+'  - '+line(v)).join('\r\n')+'\r\nER  -\r\n'}).join('\r\n');
 if(format==='bibtex')return records.map(c=>{const type={'article-journal':'article',book:'book',chapter:'incollection','paper-conference':'inproceedings',thesis:'phdthesis',report:'techreport'}[c.type]||'misc';const f={title:tex(c.title),author:(c.author||[]).map(a=>a.literal?'{'+tex(a.literal)+'}':tex([[a['non-dropping-particle'],a.family].filter(Boolean).join(' '),a.given,a.suffix].filter(Boolean).join(', '))).join(' and '),year:tex(c.issued?.['date-parts']?.[0]?.[0]),journal:tex(c['container-title']),volume:tex(c.volume),number:tex(c.issue),pages:tex(c.page),doi:tex(c.DOI),url:tex(c.URL),publisher:tex(c.publisher)};return '@'+type+'{ev'+String(c.id).replace(/[^a-zA-Z0-9]/g,'' )+',\n'+Object.entries(f).filter(([,v])=>v).map(([k,v])=>'  '+k+' = {'+v+'}').join(',\n')+'\n}'}).join('\n\n');
 throw Error('Unsupported bibliography export.');
}
export function bibliographyLabel(source){const c=referenceCsl(source);return [(c.author||[]).map(nameText).join('; ')||'Author not recorded',c.issued?.['date-parts']?.[0]?.[0]||'Date not recorded',c.title,c['container-title'],[c.volume,c.issue&&'('+c.issue+')',c.page].filter(Boolean).join(' '),c.DOI?'doi:'+c.DOI:c.URL].filter(Boolean).join('. ')}
