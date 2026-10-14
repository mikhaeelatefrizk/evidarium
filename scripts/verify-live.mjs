/** Real account acceptance check. No credentials are read or exported by this script. */
import {parseArgs} from 'node:util';import {createHash} from 'node:crypto';import {writeFile} from 'node:fs/promises';
const {values}=parseArgs({options:{model:{type:'string'},port:{type:'string',default:'4317'},output:{type:'string',default:'live-verification.json'},'use-chatgpt-plan':{type:'boolean'},'approve-fixture-analysis':{type:'boolean'}}});
if(!values.model||!values['use-chatgpt-plan']||!values['approve-fixture-analysis']){
 console.error('Run the local app and sign in first. This check creates a clearly named verification project, uploads two synthetic files, approves text extraction and a 3-row CSV calculation, and makes TWO real requests using your ChatGPT plan. No other analysis is authorized.\nUsage: node scripts/verify-live.mjs --model <catalog-slug> --use-chatgpt-plan --approve-fixture-analysis --output live-verification.json');process.exit(2);
}
const port=Number(values.port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port.');
const origin='http://127.0.0.1:'+port,report={started_at:new Date().toISOString(),model:values.model,checks:[],status:'running',scope:'Synthetic account-to-export engineering acceptance check; not a scientific validation.'};
const check=(name,detail)=>report.checks.push({name,status:'passed',...detail});
async function api(route,method='GET',body){const res=await fetch(origin+'/api/'+route,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const json=await res.json();if(!res.ok)throw Error(json.error||`HTTP ${res.status}`);return json}
async function upload(project,name,text){const bytes=Buffer.from(text),f=await api(`projects/${project}/files`,'POST',{name,size:bytes.length,mime:'text/plain'});const res=await fetch(origin+`/api/files/${f.id}/part?n=1`,{method:'PUT',headers:{'X-Part-Sha256':createHash('sha256').update(bytes).digest('hex')},body:bytes,signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('Verification fixture upload failed.');await api(`files/${f.id}/complete`,'POST',{});return f.id}
async function waitTask(project,id){const deadline=Date.now()+10*60*1000;while(Date.now()<deadline){const data=await api('projects/'+project),task=data.tasks.find(t=>t.id===id);if(task&&!['queued','running'].includes(task.state)){if(task.state!=='completed')throw Error(task.error||task.state);return {data,task,result:JSON.parse(task.result)}}await new Promise(r=>setTimeout(r,1000))}throw Error('Task timed out; inspect its state in Evidarium.');}
try{
 const boot=await api('bootstrap');if(!boot.local)throw Error('This check only supports the standalone local edition.');
 const auth=await api('ai/status');if(!auth.connected)throw Error(auth.error||'Complete Continue with ChatGPT in the local app first.');
 if(!auth.models.some(m=>m.slug===values.model))throw Error('Requested model is not in the live account catalog. No substitution was made.');
 check('live model catalog',{available_models:auth.models.map(m=>m.slug)});
 const p=await api('projects','POST',{title:'Verification — '+new Date().toISOString(),question:'Synthetic acceptance test, not original research.'});report.project_id=p.id;
 const ref=await upload(p.id,'reference.txt','The reference values are 2, 4, and 6. Their arithmetic mean is 4.'),csv=await upload(p.id,'values.csv','value\n2\n4\n6\n');
 for(const [kind,file_id] of [['extract',ref],['describe_csv',csv]]){
  const t=await api('tasks','POST',{project:p.id,kind,args:{file_id}});if(t.state!=='awaiting_approval')throw Error('Task approval boundary failed.');
  await api(`tasks/${t.id}/approve`,'POST',{});const out=await waitTask(p.id,t.id);
  if(kind==='describe_csv'&&(out.result.result.columns.value.mean!==4||out.result.result.columns.value.sd!==2))throw Error('Known numeric reference did not match.');
  check(kind,{input_sha256:out.result.provenance.input_sha256});
 }
 const prompts=[`Read the extracted reference.txt using evidence_search. Quote its exact two sentences and cite [F:${ref}, text]. Report the mean and sample standard deviation from the completed describe_csv task. This is a synthetic verification, not a scientific claim.`, 'Now answer a follow-up using the same evidence: what were the three reference values? Include the exact file citation again.'];
 for(const [i,text] of prompts.entries()){
  const task=await api('chat','POST',{project:p.id,model:values.model,text}),out=await waitTask(p.id,task.id);
  const answer=out.data.messages.filter(m=>m.role==='assistant').at(-1),audit=JSON.parse(answer.citation_audit||'null');
  if(answer.status!=='complete'||!audit||audit.issues!==0||!audit.references.some(r=>r.status==='passage_available'))throw Error('Response completed without the required valid passage citation. Inspect the preserved conversation.');
  check('live cited conversation '+(i+1),{model:out.result.model,rounds:out.result.rounds,usage:out.result.usage,citation_report:audit});
 }
 const exported=await api(`projects/${p.id}/export`);if(!exported.audit.some(x=>x.action==='task.approved')||exported.messages.filter(x=>x.role==='assistant'&&x.status==='complete').length!==2)throw Error('Export did not retain the completed workflow.');
 check('project export',{messages:exported.messages.length,tasks:exported.tasks.length,audit_entries:exported.audit.length});report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1}
report.finished_at=new Date().toISOString();await writeFile(values.output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,report:values.output,project_id:report.project_id,error:report.error}));
