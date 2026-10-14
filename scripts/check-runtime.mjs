/** Check the actual SQLite capability before creating or migrating user data. */
import {DatabaseSync} from 'node:sqlite';
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<24||(major===24&&minor<19))throw Error('Evidarium requires Node.js 24.19 or newer. Earlier releases may lack SQLite FTS5.');
const db=new DatabaseSync(':memory:');
try{db.exec('CREATE VIRTUAL TABLE test_fts USING fts5(text)')}catch{throw Error('This Node.js build does not include SQLite FTS5. Install an official Node.js 24.19+ build.')}finally{db.close()}
