import jstatPackage from 'jstat';
const {jStat}=jstatPackage;
export const WEB_SCIENCE_VERSION='0.4.0';
export const WEB_LIMITS=Object.freeze({bytes:1024*1024,pdfBytes:5*1024*1024,rows:50000,columns:100,cells:250000,textCharacters:200000,studies:200});
export const WEB_KINDS=['web_describe_csv','web_meta_analysis','web_extract_text','web_extract_pdf'];
const requireValue=(condition,message)=>{if(!condition)throw new Error(message)};
export function decodeText(bytes){
 requireValue(bytes.byteLength<=WEB_LIMITS.bytes,'Website analysis accepts inputs up to 1 MiB.');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('The file is not valid UTF-8 text. Convert its encoding explicitly before analysis.')}
 requireValue(!text.includes('\0'),'Binary content is not supported by the website text reader.');return text.replace(/^\uFEFF/,'');
}
/** Strict comma-separated records, including quoted commas/newlines and escaped quotes. */
export function parseCsv(text){
 const records=[];let row=[],cell='',quoted=false,closed=false,started=false,cells=0;
 function field(){row.push(cell);cell='';closed=false;started=false;if(++cells>WEB_LIMITS.cells)throw Error('CSV exceeds 250,000 cells.');}
 function record(){field();records.push(row);row=[];if(records.length>WEB_LIMITS.rows+1)throw Error('CSV exceeds 50,000 data rows.');}
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
  if(c==='"'){requireValue(!started&&!closed,'Unexpected quote in an unquoted CSV field.');quoted=true;started=true;continue}
  if(c===','){field();continue}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;record();continue}
  requireValue(!closed,'Unexpected text after a quoted CSV field.');cell+=c;started=true;
 }
 requireValue(!quoted,'CSV ends inside a quoted field.');if(row.length||cell||started||closed)record();
 requireValue(records.length>=2,'CSV requires a header and at least one data row.');
 const headers=records.shift().map(x=>x.trim());requireValue(headers.length<=WEB_LIMITS.columns,'CSV exceeds 100 columns.');
 requireValue(headers.every(x=>x&&x.length<=200)&&new Set(headers).size===headers.length,'CSV headers must be nonempty, unique, and at most 200 characters.');
 for(const [i,r] of records.entries())requireValue(r.length===headers.length,`CSV record ${i+2} has ${r.length} fields; expected ${headers.length}. Nothing was silently dropped.`);
 return {headers,rows:records};
}
export function numberValue(value){const s=String(value).trim();return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null}
const sum=a=>{let result=0,c=0;for(const x of a){const y=x-c,t=result+y;c=(t-result)-y;result=t}return result};
export function describeCsv(csv){
 const columns=Object.create(null);
 for(let j=0;j<csv.headers.length;j++){
  const values=[];let missing=0,mean=0,m2=0;
  for(const r of csv.rows){if(!r[j].trim()){missing++;continue}const x=numberValue(r[j]);if(x===null)continue;values.push(x);const delta=x-mean;mean+=delta/values.length;m2+=delta*(x-mean)}
  values.sort((a,b)=>a-b);const n=values.length,median=n?(n%2?values[(n-1)/2]:values[n/2-1]/2+values[n/2]/2):null;
  const item={rows:csv.rows.length,missing_or_empty:missing,finite_numeric:n,non_numeric_nonempty:csv.rows.length-missing-n,mean:n?mean:null,sd:n>1?Math.sqrt(Math.max(0,m2)/(n-1)):null,min:n?values[0]:null,max:n?values[n-1]:null,median};
  requireValue(Object.values(item).every(v=>v===null||Number.isFinite(v)),'The numeric range exceeds reliable floating-point arithmetic. Rescale the data.');columns[csv.headers[j]]=item;
 }
 return {type:'descriptive_statistics',rows:csv.rows.length,columns,method:'Finite decimal values; sample standard deviation (n−1); numeric values analyzed per column',warnings:['Missing and nonnumeric cells are counted separately and excluded per column. Inspect these counts before interpreting summaries.']};
}
function golden(f,a,b){const ratio=(Math.sqrt(5)-1)/2;let c=b-ratio*(b-a),d=a+ratio*(b-a),fc=f(c),fd=f(d);for(let i=0;i<100;i++){if(fc<fd){b=d;d=c;fd=fc;c=b-ratio*(b-a);fc=f(c)}else{a=c;c=d;fc=fd;d=a+ratio*(b-a);fd=f(d)}}return (a+b)/2}
/** Intercept-only REML fit. Distribution functions are from pinned jStat 1.9.6. */
export function fitMeta(effects,variances){
 const k=effects.length;requireValue(k>=3&&k<=WEB_LIMITS.studies&&variances.length===k,'Meta-analysis requires 3–200 independent effect estimates.');
 requireValue(effects.every(Number.isFinite)&&variances.every(v=>Number.isFinite(v)&&v>0),'Every effect must be finite and every sampling variance strictly positive.');
 requireValue(Math.max(...variances)/Math.min(...variances)<=1e10,'Sampling variances span too large a range for this website solver.');
 const center=sum(effects.map(y=>y/k)),spread=Math.max(...effects.map(y=>Math.abs(y-center))),scale=Math.max(...variances,spread*spread);
 requireValue(Number.isFinite(scale)&&scale>0,'Rescale effects and sampling variances before fitting.');
 const ys=effects.map(y=>(y-center)/Math.sqrt(scale)),vs=variances.map(v=>v/scale);
 const calc=tau=>{const w=vs.map(v=>1/(v+tau)),sw=sum(w),mu=sum(w.map((x,i)=>x*ys[i]))/sw,q=sum(w.map((x,i)=>x*(ys[i]-mu)**2));return {w,sw,mu,q}};
 const objective=tau=>{const r=calc(tau);return .5*(sum(vs.map(v=>Math.log(v+tau)))+Math.log(r.sw)+r.q)};
 const lower=Math.max(Number.MIN_VALUE,Math.min(...vs)*1e-8),upper=8*Math.max(1,(Math.max(...ys)-Math.min(...ys))**2);
 const grid=[0,...Array.from({length:161},(_,i)=>Math.exp(Math.log(lower)+(Math.log(upper)-Math.log(lower))*i/160))],scores=grid.map(objective);
 const candidates=[0];for(let i=1;i<grid.length-1;i++)if(scores[i]<=scores[i-1]&&scores[i]<=scores[i+1])candidates.push(golden(objective,grid[i-1],grid[i+1]));
 requireValue(scores.at(-1)>scores.at(-2),'REML upper bound was insufficient. No estimate was accepted.');
 const tau=candidates.reduce((best,t)=>objective(t)<objective(best)?t:best,0),fit=calc(tau),fixed=calc(0),sw2=sum(fixed.w.map(w=>w*w));
 const estimate=center+fit.mu*Math.sqrt(scale),tau2=tau*scale,kh=fit.q/(k-1),se=Math.sqrt(kh/fit.sw*scale),df=k-1,critical=jStat.studentt.inv(.975,df),ci_lower=estimate-critical*se,ci_upper=estimate+critical*se;
 const typical=(k-1)/(fixed.sw-sw2/fixed.sw)*scale,I2=100*tau2/(tau2+typical),QE=fixed.q,p_value=se>0?Math.min(1,2*jStat.studentt.cdf(-Math.abs(estimate/se),df)):null;
 const result={type:'meta_analysis',k,estimate,se,ci_lower,ci_upper,tau2,I2,QE,p_value,df,confidence_level:.95,method:'REML',test:'Knapp–Hartung (unmodified)',effect_scale:'The original input scale; log ratios are not exponentiated',solver:'Normalized REML likelihood, 161 log-spaced brackets, golden-section refinement; boundary zero included',studies:effects.map((effect,i)=>({row:i+2,effect,variance:variances[i],ci_lower:effect-1.959963984540054*Math.sqrt(variances[i]),ci_upper:effect+1.959963984540054*Math.sqrt(variances[i]),weight_percent:100*fit.w[i]/fit.sw})),warnings:['Assumes independent, comparable effect estimates with known sampling variances. Dependence, selection bias and study quality are not resolved by this calculation.','Study intervals use normal quantiles; the pooled interval uses the unmodified Knapp–Hartung t interval.']};
 if(k<10)result.warnings.push('Fewer than ten studies: heterogeneity and interval estimates can be unstable.');if(kh<1)result.warnings.push('Knapp–Hartung scale is below 1; this unmodified interval may be narrower than the conventional interval.');if(se===0)result.warnings.push('The fitted standard error is zero; a meaningful test p-value is not reported.');
 requireValue([estimate,se,ci_lower,ci_upper,tau2,I2,QE,...result.studies.flatMap(s=>[s.ci_lower,s.ci_upper,s.weight_percent])].every(Number.isFinite),'The calculation exceeded the supported numeric range.');return result;
}
export function validateWebParameters(kind,args){
 requireValue(WEB_KINDS.includes(kind),'This engine is not available for website execution.');
 requireValue(args&&typeof args==='object'&&!Array.isArray(args),'Analysis parameters must be an object.');
 requireValue(typeof args.file_id==='string'&&args.file_id.length<=100,'Choose a completed input file.');
 const keys=kind==='web_meta_analysis'?['file_id','effect','variance','label','independent_effects_confirmed']:['file_id'];
 requireValue(Object.keys(args).every(k=>keys.includes(k)),'Unsupported website analysis parameter.');
 if(kind==='web_meta_analysis'){
  requireValue(args.independent_effects_confirmed===true,'Confirm that the effects are independent and comparable.');
  requireValue(typeof args.effect==='string'&&args.effect.trim()&&typeof args.variance==='string'&&args.variance.trim()&&args.effect!==args.variance,'Choose distinct effect and sampling-variance columns.');
  requireValue([args.effect,args.variance,args.label||''].every(v=>typeof v==='string'&&v.length<=200),'Column names must be at most 200 characters.');
 }
 return {...args};
}
export function runWebScience(kind,args,bytes,name){
 const text=decodeText(bytes);
 if(kind==='web_extract_text'){
  requireValue(/\.(txt|md|csv|tsv|json|xml|jats|ris|bib|fasta|fa|fna)$/i.test(name),'Website extraction supports listed UTF-8 text formats. PDF, DOCX and scanned files need another extractor.');
  requireValue(text.length<=WEB_LIMITS.textCharacters,'Website extraction accepts at most 200,000 characters.');
  return {type:'text_extraction',segments:[{location:'text',text}],characters:text.length,method:'UTF-8 text decoding; markup retained',complete:true,warnings:[]};
 }
 requireValue(/\.csv$/i.test(name),'Upload a comma-separated .csv file for this analysis.');
 const csv=parseCsv(text);if(kind==='web_describe_csv')return describeCsv(csv);
 requireValue(kind==='web_meta_analysis','Unknown website engine.');
 const yi=csv.headers.indexOf(args.effect),vi=csv.headers.indexOf(args.variance),li=args.label?csv.headers.indexOf(args.label):-1;
 requireValue(yi>=0&&vi>=0&&(!args.label||li>=0),'A selected column does not exist in this CSV.');
 const y=csv.rows.map(r=>numberValue(r[yi])),v=csv.rows.map(r=>numberValue(r[vi]));
 requireValue(y.every(x=>x!==null)&&v.every(x=>x!==null),'Effect and variance columns must contain finite numbers on every row; no studies were silently removed.');
 const result=fitMeta(y,v);result.studies.forEach((s,i)=>{s.label=li>=0?csv.rows[i][li].slice(0,200):`Record ${i+1}`});return result;
}
