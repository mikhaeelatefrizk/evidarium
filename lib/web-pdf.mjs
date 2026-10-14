import {getDocumentProxy,getResolvedPDFJS} from 'unpdf';
/** Sequential, text-only extraction. No rendering, embedded actions, or OCR. */
export async function extractWebsitePdf(bytes,name){
 if(!/\.pdf$/i.test(name)||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('Choose a PDF file with a valid PDF header.');
 const deadline=Date.now()+15000,warnings=[],segments=[];let characters=0,processed=0;
 const pdf=await getDocumentProxy(new Uint8Array(bytes),{isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,standardFontDataUrl:null,cMapUrl:null,wasmUrl:null,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,maxImageSize:0,stopAtErrors:true,verbosity:0});
 try{
  const totalPages=pdf.numPages,maxPages=Math.min(totalPages,50);if(totalPages>50)warnings.push(`Only the first 50 of ${totalPages} pages were read.`);
  for(let i=1;i<=maxPages;i++){
   if(Date.now()>deadline){warnings.push('The extraction time budget was reached; remaining pages were not read.');break}
   const page=await pdf.getPage(i);let text='';
   try{
    const stream=page.streamTextContent({includeMarkedContent:false,disableNormalization:false}),reader=stream.getReader();
    try{while(true){const {value,done}=await reader.read();if(done)break;
     for(const item of value.items){if(typeof item.str!=='string')continue;const part=item.str+(item.hasEOL?'\n':' '),room=200000-characters-text.length;text+=part.slice(0,Math.max(0,room));if(part.length>room){warnings.push('The 200,000-character limit was reached; text is incomplete.');await reader.cancel();break}}
     if(characters+text.length>=200000){if(!warnings.some(x=>x.includes('200,000')))warnings.push('The 200,000-character limit was reached; text is incomplete.');await reader.cancel();break}
     if(Date.now()>deadline){warnings.push('The extraction time budget was reached; this page may be incomplete.');await reader.cancel();break}
    }}finally{reader.releaseLock()}
   }finally{page.cleanup()}
   processed++;text=text.trim();if(!text)warnings.push(`Page ${i} has no extracted text; scanned text, figures or unavailable character maps may require another method.`);
   if(text){segments.push({location:`page ${i}`,text});characters+=text.length}
   if(characters>=199999)break;
  }
  if(processed<totalPages&&!warnings.some(x=>x.includes('remaining')||x.includes('first 50')||x.includes('incomplete')))warnings.push('Not every page was fully read.');
  const {version}=await getResolvedPDFJS();return {type:'text_extraction',segments,characters,total_pages:totalPages,processed_pages:processed,method:`PDF.js ${version} via unpdf 1.8.1`,complete:warnings.length===0,coverage:'Extractable text items only; reading order follows the PDF text stream.',limitations:['No OCR, image interpretation, table reconstruction, equation understanding, or guarantee of correct reading order.'],warnings};
 }finally{await pdf.loadingTask.destroy()}
}
