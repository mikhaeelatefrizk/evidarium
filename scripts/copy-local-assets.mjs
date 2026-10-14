import {copyFile,readFile,writeFile,cp} from 'node:fs/promises';
await copyFile(new URL('../public/favicon.svg',import.meta.url),new URL('../dist-local/favicon.svg',import.meta.url));
const guide=await readFile(new URL('../public/guide.html',import.meta.url),'utf8');
await writeFile(new URL('../dist-local/guide.html',import.meta.url),guide.replaceAll('href="/downloads/','href="https://evidarium.mikhaeelatef.chatgpt.site/downloads/'));

await cp(new URL('../public/examples',import.meta.url),new URL('../dist-local/examples',import.meta.url),{recursive:true});
