import path from 'node:path';
import {existsSync,readFileSync,statSync} from 'node:fs';

/** Local installation settings only: research documents cannot select executables. */
export function enginePython(dataRoot,kind,fallback){
 const file=path.join(dataRoot,'engine-runtimes.json');
 if(!existsSync(file))return fallback;
 let settings;try{settings=JSON.parse(readFileSync(file,'utf8'))}catch{throw Error('Cannot read engine-runtimes.json. Repair the local engine configuration before running an analysis.')}
 const selected=settings[kind];if(!selected)return fallback;
 const executable=typeof selected==='string'?selected:selected.python;
 if(typeof executable!=='string'||!path.isAbsolute(executable)||!existsSync(executable)||!statSync(executable).isFile())throw Error(`The configured ${kind} Python environment is unavailable. Reinstall that engine.`);
 return executable;
}
