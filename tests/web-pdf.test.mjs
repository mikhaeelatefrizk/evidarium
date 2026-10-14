import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {extractWebsitePdf} from '../lib/web-pdf.mjs';
const fixture=name=>new Uint8Array(Buffer.from(readFileSync(new URL(`./fixtures/pdf-${name}.b64`,import.meta.url),'utf8').trim(),'base64'));
test('actual website PDF parser preserves page locations and known text',async()=>{
 const bytes=fixture('text'),length=bytes.length,result=await extractWebsitePdf(bytes,'reference.pdf');assert.equal(bytes.length,length);assert.equal(result.total_pages,2);assert.equal(result.processed_pages,2);assert.equal(result.complete,true);assert.deepEqual(result.segments.map(s=>s.location),['page 1','page 2']);assert.match(result.segments[1].text,/Page 2: The controlled research fixture reports a mean of four/);assert.match(result.method,/PDF.js/);assert.match(result.limitations[0],/No OCR/);
});
test('empty-image-style PDFs are partial, never claimed to be fully read',async()=>{
 const result=await extractWebsitePdf(fixture('blank'),'blank.pdf');assert.equal(result.complete,false);assert.equal(result.characters,0);assert.match(result.warnings[0],/no extracted text/);
});
test('PDF page limit retains actual coverage and does not silently read all pages',async()=>{
 const result=await extractWebsitePdf(fixture('long'),'long.pdf');assert.equal(result.total_pages,51);assert.equal(result.processed_pages,50);assert.equal(result.complete,false);assert.equal(result.segments.length,50);assert.match(result.warnings[0],/first 50/);
});
test('invalid and corrupt PDFs fail rather than producing text from arbitrary bytes',async()=>{
 await assert.rejects(extractWebsitePdf(new TextEncoder().encode('plain text'),'bad.pdf'),/valid PDF/);await assert.rejects(extractWebsitePdf(new TextEncoder().encode('%PDF-1.7\ncorrupt'),'bad.pdf'));
});
