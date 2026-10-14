import {fitMeta,describeCsv,parseCsv,WEB_SCIENCE_VERSION} from './web-science.mjs';
import {BCG_REFERENCE} from './science-reference.mjs';
import {PDF_REFERENCE_BASE64} from './pdf-reference.mjs';
/** Fixed, public reference calculations only. No private projects, user code, or AI. */
export async function scienceCheck(local=false){
 const started=Date.now(),stats=describeCsv(parseCsv('value\n2\n4\n6\n')).columns.value,meta=fitMeta(BCG_REFERENCE.effects,BCG_REFERENCE.variances);
 const errors=Object.fromEntries(['estimate','se','ci_lower','ci_upper','tau2','I2','QE','p_value'].map(k=>[k,Math.abs(meta[k]-BCG_REFERENCE.reference[k])]));
 const checks=[{name:'Known CSV values 2, 4, 6',passed:stats.mean===4&&stats.sd===2&&stats.median===4,actual:stats,reference:{mean:4,sample_sd:2,median:4}},{name:'13-study published BCG meta-analysis',passed:Object.entries(errors).every(([k,e])=>e<1e-6+Math.abs(BCG_REFERENCE.reference[k])*2e-6),actual:{estimate:meta.estimate,se:meta.se,ci_lower:meta.ci_lower,ci_upper:meta.ci_upper,tau2:meta.tau2,I2:meta.I2,QE:meta.QE,p_value:meta.p_value},reference:BCG_REFERENCE.reference,absolute_errors:errors,source:'https://wviechtb.github.io/metafor/'}];
 try{const {extractWebsitePdf}=await import('./web-pdf.mjs'),pdf=await extractWebsitePdf(Uint8Array.from(atob(PDF_REFERENCE_BASE64),c=>c.charCodeAt(0)),'reference.pdf');checks.push({name:'Generated two-page PDF',passed:pdf.total_pages===2&&pdf.processed_pages===2&&pdf.complete&&pdf.segments[1]?.text.includes('a mean of four'),actual:{pages:pdf.processed_pages,characters:pdf.characters,method:pdf.method}})}catch(e){checks.push({name:'Generated two-page PDF',passed:false,error:String(e.message)})}
 return {status:checks.every(c=>c.passed)?'passed':'failed',engine_version:WEB_SCIENCE_VERSION,execution:local?'local_native':'hosted_native',executed_at:new Date().toISOString(),elapsed_ms:Date.now()-started,scope:'Actual calculations and PDF parsing on fixed public reference data. Does not test sign-in, private storage, browser interaction, AI, or scientific suitability of your own data.',checks};
}
