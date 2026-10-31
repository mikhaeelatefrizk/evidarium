/** Frontend-only source audit. Run after installing the TypeScript dev dependency. */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import {systemMessages,translateSystemMessage} from '../lib/ui-localization.mjs';
const catalog={...systemMessages},issues=[];
const sourceFiles=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?sourceFiles(path.join(folder,item.name)):/\.tsx?$/.test(item.name)?[path.join(folder,item.name)]:[]);
const parse=file=>ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
const literal=node=>node&&(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))?node.text:null;
const walk=(node,visit)=>{visit(node);ts.forEachChild(node,child=>walk(child,visit));};
const placeholders=text=>[...text.matchAll(/\{([a-zA-Z_][\w]*)\}/g)].map(m=>m[1]).sort().join(',');
for(const file of sourceFiles('app/i18n'))walk(parse(file),node=>{
  if(ts.isPropertyAssignment(node)){
    const key=literal(node.name),value=literal(node.initializer);
    if(key!==null&&value!==null){
      if(placeholders(key)!==placeholders(value))issues.push(`${file}: placeholder mismatch for ${JSON.stringify(key)}`);
      catalog[key]=value;
    }
  }
});
const stable=new Set(['E','Evidarium','OpenAI','ChatGPT','CSV','PDF','JSON','RIS','CSL JSON','BibTeX','DOI','PMID','PMCID','SHA-256','HTML','Markdown','Python','REML','Knapp–Hartung','BCG','PRISMA 2020 ↗','English','العربية']);
const covered=text=>!/[A-Za-z]{2}/.test(text)||stable.has(text)||Boolean(catalog[text])||translateSystemMessage(text,'ar')!==text;
for(const file of sourceFiles('app').filter(f=>!f.includes(`${path.sep}i18n${path.sep}`))){
  const ast=parse(file);
  const report=(node,message)=>{const {line}=ast.getLineAndCharacterOfPosition(node.getStart(ast));issues.push(`${file}:${line+1}: ${message}`);};
  walk(ast,node=>{
    if(ts.isCallExpression(node)&&['t','tr','localizeMessage'].includes(node.expression.getText(ast))){const key=literal(node.arguments[0]);if(key!==null&&!covered(key))report(node,`missing translation ${JSON.stringify(key)}`);}
    if(ts.isJsxText(node)){const text=node.text.replace(/\s+/g,' ').trim();if(text&&/[A-Za-z]{2}/.test(text)&&!stable.has(text))report(node,`untranslated visible text ${JSON.stringify(text)}`);}
    if(ts.isJsxAttribute(node)&&['placeholder','title','aria-label','alt'].includes(node.name.getText(ast))){const key=literal(node.initializer);if(key&&!stable.has(key)&&/[A-Za-z]{2}/.test(key))report(node,`untranslated ${node.name.getText(ast)} ${JSON.stringify(key)}`);}
  });
}
if(issues.length){console.error(issues.join('\n'));console.error(`Language source audit: ${issues.length} issue(s).`);process.exitCode=1;}
else console.log(`Language source audit passed (${Object.keys(catalog).length} source-key translations).`);
