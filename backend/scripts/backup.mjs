import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const backendDir=path.resolve(import.meta.dirname,'..');
const source=path.resolve(process.env.BACKEND_DATABASE_PATH||path.join(backendDir,'../storage/app.db'));
const destination=process.argv[2]?path.resolve(process.argv[2]):'';
if(!destination) throw new Error('Usage: npm run backup -- <new-backup.sqlite>');
if(source===destination) throw new Error('Backup destination must differ from the live backend database.');
if(!fs.existsSync(source)) throw new Error(`Backend database does not exist: ${source}`);
if(fs.existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`);
fs.mkdirSync(path.dirname(destination),{recursive:true});
const escape=(value)=>value.replaceAll("'","''");
const db=new DatabaseSync(source);
try { db.exec(`VACUUM INTO '${escape(destination)}'`); } finally { db.close(); }
const check=verify(destination);
const hash=createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
console.log(JSON.stringify({status:'ok',source,destination,sha256:hash,...check},null,2));

function verify(file) {
  const snapshot=new DatabaseSync(file);
  try {
    const integrity=snapshot.prepare('PRAGMA integrity_check').all();
    const foreignKeys=snapshot.prepare('PRAGMA foreign_key_check').all();
    const tables=snapshot.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row)=>row.name);
    const required=['students','student_facts','student_assignments','student_review_sessions','student_issues','issue_occurrences',
      'issue_evidence','conversation_message_cache','conversation_backfill_jobs','student_conversation_link_history'];
    const missing=required.filter((table)=>!tables.includes(table));
    if(integrity.length!==1||integrity[0].integrity_check!=='ok'||foreignKeys.length||missing.length)
      throw new Error(`Backup validation failed: ${JSON.stringify({integrity,foreignKeys,missing})}`);
    return {integrity:'ok',foreignKeyViolations:foreignKeys.length,tables:tables.length};
  } finally { snapshot.close(); }
}
