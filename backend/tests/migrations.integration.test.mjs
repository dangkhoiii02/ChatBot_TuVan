import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const backendDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'backend-migrations-'));

test('legacy backend migration is rerunnable and preserves facts, evidence, and issue attribution',{timeout:30_000},()=>{
  const legacyFile=path.join(tempDir,'legacy.sqlite');
  const old=new DatabaseSync(legacyFile);
  old.exec(`CREATE TABLE students(id TEXT PRIMARY KEY,page_id TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO students VALUES('legacy-student','qa-page','Legacy',datetime('now'),datetime('now'));
    CREATE TABLE student_issues(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,title TEXT NOT NULL,normalized_title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'needs_verification',first_occurred_at TEXT,last_occurred_at TEXT,resolved_at TEXT,revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO student_issues VALUES('legacy-issue','legacy-student','Old issue','old issue','', 'active',NULL,NULL,NULL,1,datetime('now'),datetime('now'));
    CREATE TABLE issue_occurrences(id TEXT PRIMARY KEY,issue_id TEXT NOT NULL,assignment_id TEXT,review_session_id TEXT,occurred_at TEXT NOT NULL,
      source_kind TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 1,source_key TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO issue_occurrences VALUES('legacy-occurrence','legacy-issue',NULL,NULL,datetime('now'),'teacher_confirmed',1,1,NULL,'staff',datetime('now'));
    CREATE TABLE issue_evidence(id TEXT PRIMARY KEY,occurrence_id TEXT NOT NULL,conversation_id TEXT,message_id TEXT,review_session_id TEXT,
      speaker TEXT NOT NULL,verbatim_text TEXT NOT NULL,occurred_at TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(conversation_id,message_id,occurrence_id));
    INSERT INTO issue_evidence VALUES('legacy-evidence','legacy-occurrence',NULL,NULL,NULL,'Teacher','Original quote',datetime('now'),datetime('now'));
    CREATE TABLE student_facts(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,kind TEXT NOT NULL,content TEXT NOT NULL,source_text TEXT,
      source_message_id TEXT,source_conversation_id TEXT,occurred_at TEXT,expires_at TEXT,status TEXT NOT NULL,use_in_suggestions INTEGER NOT NULL,
      created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO student_facts VALUES('old-event','legacy-student','event','Private old event',NULL,NULL,NULL,NULL,NULL,'active',1,'staff',datetime('now'),datetime('now'));`);
  old.close();
  try {
    const moduleUrl=new URL('../dist/db/index.js',import.meta.url).href;
    const childScript=`const {getDatabase}=await import(${JSON.stringify(moduleUrl)});const db=getDatabase();console.log(JSON.stringify({
      fact:db.prepare("SELECT sensitivity,use_in_suggestions AS useInSuggestions FROM student_facts WHERE id='old-event'").get(),
      evidence:db.prepare("SELECT issue_id AS issueId FROM issue_evidence WHERE id='legacy-evidence'").get()}));`;
    for(let run=0;run<2;run++) {
      const output=execFileSync(process.execPath,['--input-type=module','-e',childScript],{env:{...process.env,BACKEND_DATABASE_PATH:legacyFile},encoding:'utf8'});
      const row=JSON.parse(output.trim().split('\n').at(-1));
      assert.equal(row.fact.sensitivity,'private');assert.equal(row.fact.useInSuggestions,0);
      assert.equal(row.evidence.issueId,'legacy-issue');
    }
    const migrated=new DatabaseSync(legacyFile);
    try {
      assert.equal(migrated.prepare(`SELECT COUNT(*) AS count FROM backend_schema_migrations WHERE name='student_event_privacy_v1'`).get().count,1);
      assert.equal(migrated.prepare(`SELECT COUNT(*) AS count FROM backend_schema_migrations WHERE name='review_occurrence_nonunique_index_v1'`).get().count,1);
      assert.equal(migrated.prepare(`SELECT content FROM student_facts WHERE id='old-event'`).get().content,'Private old event');
      assert.equal(migrated.prepare(`SELECT verbatim_text FROM issue_evidence WHERE id='legacy-evidence'`).get().verbatim_text,'Original quote');
      const index=migrated.prepare('PRAGMA index_list(issue_occurrences)').all().find((entry)=>entry.name==='idx_occurrences_review_issue');
      assert.equal(index.unique,0);
      assert.equal(migrated.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.equal(migrated.prepare('PRAGMA foreign_key_check').all().length,0);
    } finally { migrated.close(); }
  } finally { fs.rmSync(tempDir,{recursive:true,force:true}); }
});
