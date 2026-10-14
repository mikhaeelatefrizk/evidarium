/** Real account acceptance check. No credentials are read or exported by this script. */
import {parseArgs} from 'node:util';import {writeFile} from 'node:fs/promises';
const {values}=parseArgs({options:{model:{type:'string'},port:{type:'string',default:'4317'},output:{type:'string',default:'live-verification.json'},'use-chatgpt-plan':{type:'boolean'},'approve-fixture-analysis':{type:'boolean'}}});
if(!values.model||!values['use-chatgpt-plan']||!values['approve-fixture-analysis']){
 console.error('Run the local app and sign in first. This check creates a clearly named verification project, uploads two synthetic files, approves text extraction and a 3-row CSV calculation, and runs TWO chat turns (up to 12 model requests) using your ChatGPT plan. No other analysis is authorized.\nUsage: node scripts/verify-live.mjs --model <catalog-slug> --use-chatgpt-plan --approve-fixture-analysis --output live-verification.json');process.exit(2);
}
const port=Number(values.port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port.');
const {verifyLive}=await import('../lib/live-check.mjs');
const report=await verifyLive({origin:'http://127.0.0.1:'+port,model:values.model,onProgress:message=>console.log(message)});
await writeFile(values.output,JSON.stringify(report,null,2)+'\n');if(report.status!=='passed')process.exitCode=1;console.log(JSON.stringify({status:report.status,report:values.output,project_id:report.project_id,error:report.error}));
