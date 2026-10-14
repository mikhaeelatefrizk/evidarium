import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,existsSync,createReadStream} from 'node:fs';
import {mkdir,writeFile,readFile,rm,rename,open} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';

export function createDB(filename,migrations){
 const sql=new DatabaseSync(filename);sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 sql.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort())if(!sql.prepare('SELECT name FROM _migrations WHERE name=?').get(name)){
  sql.exec('BEGIN');try{sql.exec(readFileSync(path.join(migrations,name),'utf8'));sql.prepare('INSERT INTO _migrations VALUES (?)').run(name);sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}
 }
 return {raw:sql,prepare(query){let args=[];const s=sql.prepare(query);return {bind(...values){args=values;return this},async all(){return {results:s.all(...args)}},async first(){return s.get(...args)||null},_execute(){const r=s.run(...args);return {success:true,meta:{changes:Number(r.changes)}}},async run(){return this._execute()}}},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>s._execute());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}},close(){sql.close()}};
}
export async function sha256File(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex')}
export function createBucket(root){
 mkdirSync(root,{recursive:true,mode:0o700});const uploads=path.join(root,'.uploads');mkdirSync(uploads,{recursive:true,mode:0o700});
 const filepath=key=>{if(!/^[a-zA-Z0-9_/-]+$/.test(key)||key.includes('..'))throw Error('Invalid storage key');const f=path.resolve(root,key);if(!f.startsWith(path.resolve(root)+path.sep))throw Error('Invalid storage path');return f};
 function resume(key,id){if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid upload');const folder=path.join(uploads,id);return {uploadId:id,async uploadPart(n,bytes){const manifest=JSON.parse(await readFile(path.join(folder,'manifest.json')));if(manifest.key!==key)throw Error('Upload key mismatch');await writeFile(path.join(folder,String(n)),Buffer.from(bytes),{mode:0o600});return {partNumber:n,etag:createHash('sha256').update(Buffer.from(bytes)).digest('hex')}},async complete(parts){const manifest=JSON.parse(await readFile(path.join(folder,'manifest.json')));if(manifest.key!==key)throw Error('Upload key mismatch');const dest=filepath(key);await mkdir(path.dirname(dest),{recursive:true,mode:0o700});const tmp=dest+'.part';const output=await open(tmp,'w',0o600);try{for(const part of parts){const bytes=await readFile(path.join(folder,String(part.partNumber)));if(createHash('sha256').update(bytes).digest('hex')!==part.etag)throw Error('Stored upload part failed integrity check');await output.write(bytes)}}finally{await output.close()}await rename(tmp,dest);await rm(folder,{recursive:true,force:true})},async abort(){await rm(folder,{recursive:true,force:true})}}}
 return {filepath,async createMultipartUpload(key){filepath(key);const id=randomUUID(),folder=path.join(uploads,id);await mkdir(folder,{mode:0o700});await writeFile(path.join(folder,'manifest.json'),JSON.stringify({key}),{mode:0o600});return resume(key,id)},resumeMultipartUpload:resume,async get(key){const file=filepath(key);return existsSync(file)?{body:Readable.toWeb(createReadStream(file))}:null},async put(key,bytes){const file=filepath(key);await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file,bytes,{mode:0o600})},async delete(key){await rm(filepath(key),{force:true})}};
}
