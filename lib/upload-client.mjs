/** Reselecting original bytes is required after a browser reload. No File objects or tokens are persisted. */
export async function uploadFile({file,project,fileId,fetcher=fetch,onProgress=(_message='')=>{}}){
 const request=async(path,method='GET',body)=>{const r=await fetcher('/api/'+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error||'Upload failed.');return value;};
 let id=fileId;
 if(!id)id=(await request('projects/'+project+'/files','POST',{name:file.name,mime:file.type,size:file.size})).id;
 const state=await request('files/'+id+'/upload-status');
 if(state.size!==file.size||state.name!==file.name)throw Error('Choose the original file with the same name and size.');
 if(state.status==='stored')return {id,reused:true};
 const hashes=new Map();
 const digest=async n=>{onProgress('Checking original · '+Math.round(((n-1)*state.partSize)/file.size*100)+'%');const bytes=await file.slice((n-1)*state.partSize,n*state.partSize).arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');hashes.set(n,hash);return hash;};
 // Verify every previously reserved part before sending any new bytes.
 for(const p of state.parts)if(await digest(p.partNumber)!==p.sha256)throw Error('The selected file differs from the interrupted upload. No new parts were sent.');
 if(state.status==='uploading')for(let n=1;n<=Math.ceil(file.size/state.partSize);n++){
  if(state.parts.some(p=>p.partNumber===n&&p.state==='complete'))continue;
  const bytes=await file.slice((n-1)*state.partSize,n*state.partSize).arrayBuffer(),hash=hashes.get(n)||Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  onProgress('Uploading · '+Math.round(((n-1)*state.partSize)/file.size*100)+'%');const r=await fetcher('/api/files/'+id+'/part?n='+n,{method:'PUT',headers:{'content-type':'application/octet-stream','x-part-sha256':hash},body:bytes});if(!r.ok)throw Error((await r.json()).error||'Upload interrupted.');
 }
 await request('files/'+id+'/complete','POST',{});onProgress('Complete');return {id};
}
