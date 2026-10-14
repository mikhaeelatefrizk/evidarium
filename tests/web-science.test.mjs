import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parseCsv,numberValue,describeCsv,fitMeta,runWebScience,decodeText,validateWebParameters,WEB_LIMITS} from '../lib/web-science.mjs';
test('strict CSV keeps quoted delimiters/newlines, BOM decoding, missing and nonnumeric values',()=>{
 const input=decodeText(new TextEncoder().encode('\uFEFFname,value\r\n"a,b",2\r\n"two\nlines",4\r\n"a""b",6\r\nmissing,\r\ntext,no\r\n'));
 const parsed=parseCsv(input);assert.equal(parsed.rows[0][0],'a,b');assert.equal(parsed.rows[1][0],'two\nlines');assert.equal(parsed.rows[2][0],'a"b');
 const result=describeCsv(parsed).columns.value;assert.equal(result.mean,4);assert.equal(result.sd,2);assert.equal(result.median,4);assert.equal(result.missing_or_empty,1);assert.equal(result.non_numeric_nonempty,1);assert.equal(result.finite_numeric,3);
 for(const s of ['0x10','1,000','Infinity','1e309','=1+1',''])assert.equal(numberValue(s),null);assert.equal(numberValue(' -1.2e-3 '),-.0012);
});
test('CSV rejects ambiguity, malformed quoting, unsupported numeric range and resource overflow',()=>{
 for(const s of ['x,x\n1,2','x,\n1,2','x,y\n1','x\n"unfinished','x\n"quoted"junk','x\nun"quoted'])assert.throws(()=>parseCsv(s));
 assert.throws(()=>describeCsv(parseCsv('x\n1e308\n-1e308')),/numeric range/);
 assert.throws(()=>parseCsv('x\n'+('1\n'.repeat(WEB_LIMITS.rows+1))),/50,000/);
 assert.throws(()=>decodeText(new Uint8Array(WEB_LIMITS.bytes+1)),/1 MiB/);
 assert.throws(()=>decodeText(Uint8Array.of(255)),/UTF-8/);assert.throws(()=>decodeText(Uint8Array.of(0)),/Binary/);
 const r=describeCsv(parseCsv('__proto__,constructor\n1,2'));assert.equal(r.columns.__proto__.mean,1);assert.equal(r.columns.constructor.mean,2);
});
test('meta-analysis rejects missing values, dependent/unconfirmed designs and invalid variance',()=>{
 assert.throws(()=>validateWebParameters('web_meta_analysis',{file_id:'f',effect:'yi',variance:'vi'}),/independent/);
 assert.throws(()=>fitMeta([1,2,3],[1,0,1]),/strictly positive/);assert.throws(()=>fitMeta([1,2],[1,1]),/3–200/);
 assert.throws(()=>fitMeta([1,2,3],[1e-12,1,1]),/range/);
 assert.throws(()=>runWebScience('web_meta_analysis',{effect:'yi',variance:'vi'},new TextEncoder().encode('yi,vi\n1,.1\n,.2\n3,.1'),'input.csv'),/no studies were silently removed/);
 assert.throws(()=>validateWebParameters('web_describe_csv',{file_id:'f',code:'malicious'}),/Unsupported/);
});
test('native REML matches independently generated R metafor results across 20 bounded cases',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/web-meta-reference.json',import.meta.url)));assert.equal(fixture.status,'passed');assert.equal(fixture.fixtures.length,20);
 for(const c of fixture.fixtures){const out=fitMeta(c.effects,c.variances);for(const key of ['estimate','se','ci_lower','ci_upper','tau2','I2','QE','p_value']){
  if(c.name==='identical-effects'&&key==='p_value'){assert.equal(out.p_value,null);continue}
  let unit=Math.max(...c.variances,(Math.max(...c.effects)-Math.min(...c.effects))**2);if(['estimate','se','ci_lower','ci_upper'].includes(key))unit=Math.sqrt(unit);else if(key!=='tau2')unit=1;
  const expected=c.reference[key];assert(Math.abs(out[key]-expected)<=1e-8*unit+Math.abs(expected)*2e-6,`${c.name} ${key}: ${out[key]} vs ${expected}`);
 }assert(Math.abs(out.studies.reduce((a,s)=>a+s.weight_percent,0)-100)<1e-9);}
});
test('website text extraction preserves text and markup, and rejects unsupported binary formats',()=>{
 const bytes=new TextEncoder().encode('<study>Exact finding.</study>');const r=runWebScience('web_extract_text',{},bytes,'article.xml');assert.equal(r.segments[0].text,'<study>Exact finding.</study>');assert.equal(r.complete,true);
 assert.throws(()=>runWebScience('web_extract_text',{},bytes,'paper.pdf'),/PDF/);
 assert.throws(()=>runWebScience('web_extract_text',{},new TextEncoder().encode('x'.repeat(200001)),'long.txt'),/200,000/);
});
