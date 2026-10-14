'use client';
import {useRef,useState} from 'react';
type Data=Record<string,any>;
const fmt=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString(undefined,{maximumSignificantDigits:7}):'—';
function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function csv(rows:unknown[][]){return rows.map(row=>row.map(value=>'"'+(typeof value==='number'?String(value):String(value??'').replace(/^[=+@\-\t\r]/,m=>"'"+m)).replaceAll('"','""')+'"').join(',')).join('\r\n')}
export function WebsiteCheck(){
 const [report,setReport]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <details><summary>Check the website calculations</summary><p>This runs known CSV values, a published 13-study meta-analysis and a two-page PDF through the current server. It uses public reference data, no private files or AI allowance.</p><button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const res=await fetch('/api/science-check'),data=await res.json() as Data;if(!res.ok&&!Array.isArray(data.checks))throw Error(data.error||'The reference check failed.');setReport(data)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Calculating…':'Run reference check'}</button><p role="status">{error||report&&`${report.status==='passed'?'Passed':'Failed'} · engine ${report.engine_version} · ${report.elapsed_ms} ms`}</p>{report&&<><p className="fine-print">{report.scope}</p><button type="button" className="text-button" onClick={()=>download('evidarium-server-check.json',JSON.stringify(report,null,2),'application/json')}>Download actual check report</button></>}</details>
}
export function AnalysisResult({raw}:{raw:string}){
 let output:Data;try{output=JSON.parse(raw)}catch{return <p>Result could not be read.</p>}
 const r=output.result,p=output.provenance;
 if(!r||!['meta_analysis','descriptive_statistics','text_extraction'].includes(r.type))return <pre>{JSON.stringify(output,null,2)}</pre>;
 const rows:unknown[][]=r.type==='meta_analysis'?[['Study','Effect','Variance','CI lower','CI upper','Weight %'],...r.studies.map((s:Data)=>[s.label||`Row ${s.row}`,s.effect,s.variance,s.ci_lower,s.ci_upper,s.weight_percent]),['Pooled',r.estimate,'',r.ci_lower,r.ci_upper,100]]:r.type==='descriptive_statistics'?[['Column','Rows','Numeric','Missing','Nonnumeric','Mean','Sample SD','Median','Minimum','Maximum'],...Object.entries(r.columns).map(([name,v])=>{const s=v as Data;return [name,s.rows,s.finite_numeric,s.missing_or_empty,s.non_numeric_nonempty,s.mean,s.sd,s.median,s.min,s.max]})]:[];
 return <div className="analysis-result">
  <p className="fine-print">{p?.engine} {p?.engine_version} · {p?.execution==='hosted_native'?'Executed on this website':'Executed locally'} · {r.method}</p>
  {r.type==='meta_analysis'&&<><div className="analysis-summary"><div><span>Pooled effect</span><strong>{fmt(r.estimate)}</strong></div><div><span>95% confidence interval</span><strong>{fmt(r.ci_lower)} to {fmt(r.ci_upper)}</strong></div><div><span>Studies</span><strong>{r.k}</strong></div><div><span>Heterogeneity I²</span><strong>{fmt(r.I2)}%</strong></div></div><p>{r.effect_scale}. {r.test}; τ² = {fmt(r.tau2)}; p = {fmt(r.p_value)}.</p><ForestPlot result={r}/></>}
  {r.type==='text_extraction'&&<><p>{r.characters.toLocaleString()} characters extracted.</p>{r.segments.map((s:Data,i:number)=><section key={i}><h3>{s.location}</h3><pre className="extracted-text">{s.text}</pre></section>)}</>}
  {!!rows.length&&<div className="analysis-table" tabIndex={0} aria-label="Analysis results; scroll horizontally if needed"><table><thead><tr>{rows[0].map((x,i)=><th key={i}>{String(x)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{typeof v==='number'?fmt(v):String(v??'—')}</td>)}</tr>)}</tbody></table></div>}
  {[...(r.warnings||[]),...(r.limitations||[])].map((w:string,i:number)=><p className="analysis-notice" key={i}>{w}</p>)}
  <div className="analysis-actions">{!!rows.length&&<button className="secondary" onClick={()=>download('evidarium-analysis.csv',csv(rows),'text/csv;charset=utf-8')}>Download results CSV</button>}<button className="secondary" onClick={()=>download('evidarium-analysis.json',JSON.stringify(output,null,2),'application/json')}>Download result & provenance</button></div>
  <details><summary>Execution and input fingerprint</summary><pre>{JSON.stringify(p,null,2)}</pre></details>
 </div>
}
function ForestPlot({result:r}:{result:Data}){
 const ref=useRef<SVGSVGElement>(null),studies=r.studies as Data[];
 const min=Math.min(r.ci_lower,...studies.map(s=>s.ci_lower)),max=Math.max(r.ci_upper,...studies.map(s=>s.ci_upper)),padding=Math.max((max-min)*.08,1e-9),lo=min-padding,hi=max+padding,x=(n:number)=>210+(n-lo)/(hi-lo)*460;
 const height=90+studies.length*27,pooled=45+studies.length*27;
 return <div className="forest-wrap"><svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 800 ${height}`} role="img" aria-label="Forest plot of study effects and pooled 95 percent confidence interval" style={{width:'100%',minWidth:600,background:'white',color:'#173e35',fontFamily:'Arial, sans-serif'}}>
  <title>Study effects and pooled 95% confidence interval</title><desc>Study intervals use normal quantiles. The pooled interval uses unmodified Knapp–Hartung inference. Values use the input scale.</desc>
  <text x="12" y="20" fontSize="12" fill="#173e35">Study</text><text x="690" y="20" fontSize="12" fill="#173e35">Weight</text>
  {lo<=0&&hi>=0&&<line x1={x(0)} x2={x(0)} y1="27" y2={pooled+12} stroke="#9eaaa4" strokeDasharray="3 3"/>}
  {studies.map((s,i)=>{const y=45+i*27,size=3+Math.sqrt(s.weight_percent);return <g key={i}><title>{s.label}: {s.effect}, 95% CI {s.ci_lower} to {s.ci_upper}</title><text x="12" y={y+4} fontSize="11" fill="#173e35">{String(s.label||`Record ${i+1}`).slice(0,25)}</text><line x1={x(s.ci_lower)} x2={x(s.ci_upper)} y1={y} y2={y} stroke="#1f6655"/><rect x={x(s.effect)-size/2} y={y-size/2} width={size} height={size} fill="#1f6655"/><text x="690" y={y+4} fontSize="11" fill="#173e35">{s.weight_percent.toFixed(2)}%</text></g>})}
  <text x="12" y={pooled+4} fontSize="12" fontWeight="bold" fill="#173e35">Pooled · REML / KH</text><polygon points={`${x(r.ci_lower)},${pooled} ${x(r.estimate)},${pooled-6} ${x(r.ci_upper)},${pooled} ${x(r.estimate)},${pooled+6}`} fill="#9c743a"/>
  <line x1="210" x2="670" y1={pooled+20} y2={pooled+20} stroke="#77847e"/>{[0,.25,.5,.75,1].map(t=><text key={t} x={210+t*460} y={pooled+36} textAnchor="middle" fontSize="10" fill="#173e35">{fmt(lo+t*(hi-lo))}</text>)}
 </svg><button className="text-button" onClick={()=>{if(ref.current)download('evidarium-forest.svg',new XMLSerializer().serializeToString(ref.current),'image/svg+xml')}}>Download forest plot SVG</button></div>
}
