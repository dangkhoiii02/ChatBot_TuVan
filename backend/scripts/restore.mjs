import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const source=process.argv[2]?path.resolve(process.argv[2]):'';
const target=process.argv[3]?path.resolve(process.argv[3]):'';
if(!source||!target) throw new Error('Usage: npm run restore -- <backup.sqlite> <new-target.sqlite>');
if(source===target) throw new Error('Restore source and target must differ.');
if(!fs.existsSync(source)) throw new Error(`Backup does not exist: ${source}`);
if(fs.existsSync(target)) throw new Error(`Restore target already exists; refusing to overwrite: ${target}`);
fs.mkdirSync(path.dirname(target),{recursive:true});
verify(source);
const temp=`${target}.restore-${randomUUID()}`;
try {
  fs.copyFileSync(source,temp,fs.constants.COPYFILE_EXCL);
  const check=verify(temp);
  fs.renameSync(temp,target);
  console.log(JSON.stringify({status:'ok',source,target,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),...check},null,2));
} catch(error) {
  if(fs.existsSync(temp)) fs.unlinkSync(temp);
  throw error;
}

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
      throw new Error(`Database validation failed: ${JSON.stringify({integrity,foreignKeys,missing})}`);
    return {integrity:'ok',foreignKeyViolations:foreignKeys.length,tables:tables.length};
  } finally { snapshot.close(); }
}
