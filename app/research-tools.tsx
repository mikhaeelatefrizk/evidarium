'use client';
import {useState} from 'react';
import {Search,Download,Loader2,ArrowUpRight} from 'lucide-react';
import {verifyLive} from '../lib/live-check.mjs';
import {useLocale} from './i18n';
import {researchMessage} from './i18n/research-messages';
type RecordData=Record<string,any>;
async function request(path:string,method='GET'){const r=await fetch('/api/'+path,{method});const data=await r.json() as RecordData;if(!r.ok)throw new Error(data.error||'Request failed');return data}
export function LiveVerification({model,onOpen}:{model:string;onOpen:(project:string)=>Promise<void>}){
 const {t}=useLocale(),message=(value:string)=>researchMessage(value,t);
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[report,setReport]=useState<RecordData|null>(null);
 return <details><summary>{t('Verify this connected workflow')}</summary>
  <p>{t('This creates a separate verification project with synthetic values 2, 4, and 6. It runs text extraction and CSV statistics, then runs two live chat turns (up to 12 model requests) with {model} to check citations, a follow-up, and export.',{model:'\u2068'+model+'\u2069'})}</p>
  <label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/> {t('Authorize these two computations and chat turns using my ChatGPT allowance.')}</label>
  <button className="secondary" disabled={!consent||busy||!model} onClick={async()=>{setBusy(true);setReport(null);setProgress('Checking the connected account');try{const r=await verifyLive({model,onProgress:setProgress});setReport(r)}catch(e){setReport({status:'failed',error:(e as Error).message})}finally{setBusy(false)}}}>{busy?<><Loader2 className="spin" size={15}/> {t('Verifying…')}</>:t('Run live verification')}</button>
  <p role="status" aria-live="polite">{busy?message(progress):report?.status==='passed'?t('This workflow passed. Scientific accuracy still needs separate review.'):message(report?.error||'')}</p>
  {report&&<><button className="text-button" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='evidarium-live-verification.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}>{t('Download actual verification report')}</button>{report.project_id&&<button className="text-button" onClick={()=>onOpen(report.project_id)}>{t('Inspect the verification project')} <ArrowUpRight size={13}/></button>}</>}
  <p className="fine-print">{t('Results are recorded only after actual execution. This does not test every research workflow, guarantee correctness, or enable hosted chat. Keep this app open while it runs.')}</p>
 </details>
}
export function FullTextImport({source,available,onDone}:{source:RecordData;available:boolean;onDone:(id:string)=>Promise<void>}){
 const {t}=useLocale();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="article-import"><button className="text-button" disabled={busy} onClick={async()=>{setError('');setBusy(true);try{const r=await request('sources/'+source.id+'/fulltext','POST');await onDone(r.id)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?<Loader2 size={13} className="spin"/>:<Download size={13}/>} {t(available?'Open imported article':'Import open-access text')}</button>{error&&<p className="inline-error" role="alert">{researchMessage(error,t)}</p>}</div>
}
export function CitationReport({raw}:{raw?:string|null}){
 const {t,formatNumber}=useLocale();
 if(!raw)return null;let audit:RecordData;try{audit=JSON.parse(raw)}catch{return null}
 const statuses:Record<string,string>={missing:'Missing record',not_in_context:'Not in the supplied context',abstract_available:'Abstract available',metadata_only:'Metadata only',missing_location:'Missing passage location',passage_available:'Passage available'};
 return <details className={'citation-report '+(audit.issues?'has-issues':'')}><summary>{t('{count} references checked',{count:formatNumber(audit.references.length)})}{audit.issues?' · '+t('{count} need attention',{count:formatNumber(audit.issues)}):''}</summary>
  <p>{researchMessage(audit.notice,t)}</p>{audit.references.map((r:RecordData,i:number)=><div key={i}><code dir="ltr">{r.citation}</code><strong>{t(statuses[r.status]||r.status.replaceAll('_',' '))}</strong><p>{researchMessage(r.detail,t)}</p></div>)}
  {audit.limit_reached&&<p>{t('Only the first 200 citation occurrences were checked.')}</p>}<small>{t('Reference checks do not establish scientific support.')}</small>
 </details>
}
export function ProjectSearch({project,onOpen,initialQuery=''}:{project:string;onOpen:(record:RecordData)=>Promise<void>;initialQuery?:string}){
 const {t,label}=useLocale(),message=(value:string)=>researchMessage(value,t);
 function recordTitle(record:RecordData){if(record.type==='conversation'||record.type==='analysis')return label(record.title);if(record.type==='note'&&record.title==='Research note')return t('Research note');return record.title||label(record.type)}
 const [query,setQuery]=useState(initialQuery),[kind,setKind]=useState('all'),[result,setResult]=useState<RecordData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function search(offset=0){setBusy(true);setError('');try{const next=await request('projects/'+project+'/retrieve?q='+encodeURIComponent(query)+'&kind='+kind+'&offset='+offset);setResult(prev=>offset&&prev?{...next,results:[...prev.results,...next.results]}:next)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(!project)return <p>{t('Create or choose a project to search its evidence and history.')}</p>;
 return <><p>{t('Search saved abstracts, extracted passages, conversations, notes, results, and claims. Searches stay within this project.')}</p>
  <form className="search-form" onSubmit={e=>{e.preventDefault();search()}}><select aria-label={t('Record type')} value={kind} onChange={e=>{setKind(e.target.value);setResult(null)}}>{[['all','All records'],['source','Papers'],['file','Extracted passages'],['conversation','Conversations'],['note','Notes'],['manuscript','Manuscripts'],['analysis','Analysis results'],['claim','Claims']].map(([k,label])=><option key={k} value={k}>{t(label)}</option>)}</select>
   <input autoFocus dir="auto" aria-label={t('Search this project')} value={query} onChange={e=>{setQuery(e.target.value);setResult(null)}} placeholder={t('A finding, method, or past decision')} required maxLength={500}/><button className="primary" aria-label={t('Search saved records')} disabled={busy}>{busy?<Loader2 className="spin" size={17}/>:<Search size={17}/>}</button>
  </form>{error&&<p role="alert" className="inline-error">{message(error)}</p>}
  {result&&<><p className="fine-print">{message(result.coverage.note)}</p><div className="search-results">{result.results.map((r:RecordData,i:number)=><article key={r.id+':'+r.location+':'+i}><div className="source-meta">{label(r.type)} · <bdi>{message(r.location)}</bdi></div><h3 dir="auto">{recordTitle(r)}</h3><p dir="auto" className="retrieval-excerpt">{r.text}</p><small>{message(r.verification)}</small><button className="text-button" onClick={async()=>{try{await onOpen(r)}catch(e){setError((e as Error).message)}}}>{t('Open record')} <ArrowUpRight size={13}/></button></article>)}</div>
   {!result.results.length&&<p>{t('No matching text was found. Try another term; absence from these results is not evidence of absence.')}</p>}{result.has_more&&<button className="secondary" disabled={busy} onClick={()=>search(result.next_offset)}>{t('Load more matches')}</button>}
  </>}
 </>
}
