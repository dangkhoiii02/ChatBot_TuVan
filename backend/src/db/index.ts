import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');
const dbDir = path.resolve(backendRoot, '../storage');
const dbPath = process.env.BACKEND_DATABASE_PATH?.trim()
  ? path.resolve(process.env.BACKEND_DATABASE_PATH.trim())
  : path.join(dbDir, 'app.db');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(dbPath);
    // Performance & durability settings
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_versions (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      checksum TEXT NOT NULL,
      approved_by_label TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_items (
      version_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content_json TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      PRIMARY KEY (version_id, item_id),
      FOREIGN KEY (version_id) REFERENCES knowledge_versions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS knowledge_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_version_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (active_version_id) REFERENCES knowledge_versions(id)
    );

    INSERT OR IGNORE INTO knowledge_state (id, active_version_id, updated_at)
    VALUES (1, NULL, datetime('now'));

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      page_name TEXT,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      avatar_url TEXT,
      last_message TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'unknown',
      flag_reason TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      sender_name TEXT,
      text TEXT NOT NULL,
      attachments_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      input_text TEXT NOT NULL,
      context_json TEXT,
      knowledge_version_id TEXT,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'succeeded',
      sensitivity TEXT CHECK (sensitivity IN ('xanh', 'vang', 'do')),
      flag_reason TEXT,
      replies_json TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS student_contexts (
      page_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      memories_json TEXT NOT NULL,
      custom_fields_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (page_id, student_id)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_page_id ON conversations(page_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_student_contexts_updated_at ON student_contexts(updated_at);

    -- Durable, page-scoped identity and learning history. The legacy JSON
    -- student_contexts table remains the source for existing profile fields.
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      name TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_students_page_name ON students(page_id, name);
    CREATE TABLE IF NOT EXISTS student_conversation_links (
      page_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      linked_by TEXT NOT NULL,
      linked_at TEXT NOT NULL,
      PRIMARY KEY (page_id, conversation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_student_links_student ON student_conversation_links(student_id);
    CREATE TABLE IF NOT EXISTS student_conversation_link_history (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      customer_id TEXT,
      conversation_id TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      valid_from TEXT NOT NULL,
      valid_to TEXT,
      source TEXT NOT NULL DEFAULT 'staff_confirmed',
      confirmed_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_student_link_history_lookup
      ON student_conversation_link_history(page_id,conversation_id,valid_from,valid_to);
    CREATE INDEX IF NOT EXISTS idx_student_link_history_student
      ON student_conversation_link_history(page_id,student_id,valid_from,valid_to);
    CREATE TABLE IF NOT EXISTS student_legacy_migrations (
      page_id TEXT NOT NULL,
      legacy_student_id TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      migrated_at TEXT NOT NULL,
      PRIMARY KEY(page_id,legacy_student_id,student_id)
    );
    CREATE TABLE IF NOT EXISTS student_facts (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('preference','event','learning_note')),
      content TEXT NOT NULL,
      conflict_key TEXT,
      conflict_status TEXT NOT NULL DEFAULT 'none',
      verification_status TEXT NOT NULL DEFAULT 'confirmed',
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      source_text TEXT,
      source_message_id TEXT,
      source_conversation_id TEXT,
      occurred_at TEXT,
      expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      use_in_suggestions INTEGER NOT NULL DEFAULT 1,
      use_requested INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_facts_student_status ON student_facts(student_id,status,kind);
    CREATE TABLE IF NOT EXISTS student_assignments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      started_at TEXT,
      started_source TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','unknown')),
      completed_at TEXT,
      completion_evidence TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assignments_student_status ON student_assignments(student_id,status);
    CREATE TABLE IF NOT EXISTS student_submissions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      assignment_id TEXT REFERENCES student_assignments(id) ON DELETE SET NULL,
      conversation_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','ignored')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(student_id,source_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_student_status ON student_submissions(student_id,status,submitted_at DESC);
    CREATE TABLE IF NOT EXISTS student_review_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      assignment_id TEXT REFERENCES student_assignments(id) ON DELETE SET NULL,
      conversation_id TEXT,
      submitted_at TEXT,
      reviewed_at TEXT NOT NULL,
      teacher_input TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
      confirmed_at TEXT,
      confirmation_evidence TEXT,
      source_message_id TEXT,
      client_key TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id,client_key)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_student_assignment ON student_review_sessions(student_id,assignment_id,reviewed_at);
    CREATE TABLE IF NOT EXISTS student_issues (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'needs_verification' CHECK (status IN ('active','needs_verification','resolved','recurred')),
      first_occurred_at TEXT,
      last_occurred_at TEXT,
      resolved_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id,normalized_title)
    );
    CREATE INDEX IF NOT EXISTS idx_issues_student_recent ON student_issues(student_id,last_occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issues_student_status ON student_issues(student_id,status);
    CREATE TABLE IF NOT EXISTS issue_occurrences (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES student_issues(id) ON DELETE CASCADE,
      assignment_id TEXT REFERENCES student_assignments(id) ON DELETE SET NULL,
      review_session_id TEXT REFERENCES student_review_sessions(id) ON DELETE SET NULL,
      occurred_at TEXT NOT NULL,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('teacher_confirmed','student_reported','staff_confirmed')),
      approved INTEGER NOT NULL DEFAULT 1,
      revision INTEGER NOT NULL DEFAULT 1,
      source_key TEXT,
      source_group_key TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_occurrences_issue_time ON issue_occurrences(issue_id,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_occurrences_review_issue ON issue_occurrences(issue_id,review_session_id);
    CREATE TABLE IF NOT EXISTS issue_evidence (
      id TEXT PRIMARY KEY,
      occurrence_id TEXT NOT NULL REFERENCES issue_occurrences(id) ON DELETE CASCADE,
      issue_id TEXT REFERENCES student_issues(id) ON DELETE CASCADE,
      conversation_id TEXT,
      message_id TEXT,
      review_session_id TEXT REFERENCES student_review_sessions(id) ON DELETE SET NULL,
      speaker TEXT NOT NULL,
      verbatim_text TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(conversation_id,message_id,occurrence_id)
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_occurrence ON issue_evidence(occurrence_id);
    CREATE TABLE IF NOT EXISTS issue_practice_actions (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES student_issues(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      review_session_id TEXT REFERENCES student_review_sessions(id) ON DELETE SET NULL,
      source_message_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_actions_issue_recent ON issue_practice_actions(issue_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS issue_status_events (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES student_issues(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      evidence_text TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_proposals (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      source_message_id TEXT,
      source_review_id TEXT,
      source_conversation_id TEXT,
      source_text TEXT,
      source_occurred_at TEXT,
      confidence REAL,
      prompt_version TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      created_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proposals_student_status ON student_proposals(student_id,status,created_at DESC);
    CREATE TABLE IF NOT EXISTS student_proposal_extraction_state (
      page_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      last_message_rowid INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(page_id,conversation_id,student_id)
    );
    CREATE TABLE IF NOT EXISTS student_proposal_extraction_jobs (
      page_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','complete','blocked')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_run_at TEXT NOT NULL,
      last_error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(page_id,conversation_id,student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_student_extraction_jobs_ready
      ON student_proposal_extraction_jobs(status,next_run_at);
    CREATE TABLE IF NOT EXISTS conversation_sync_state (
      page_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      oldest_cursor TEXT,
      newest_message_at TEXT,
      oldest_message_at TEXT,
      last_synced_at TEXT,
      complete INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      PRIMARY KEY(page_id,conversation_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_backfill_jobs (
      page_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','blocked')),
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_run_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(page_id,conversation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_backfill_jobs_ready
      ON conversation_backfill_jobs(status,priority DESC,next_run_at,created_at);
    CREATE TABLE IF NOT EXISTS conversation_message_cache (
      page_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      sender_name TEXT,
      text TEXT NOT NULL,
      attachments_json TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY(page_id,conversation_id,message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_message_cache_time ON conversation_message_cache(page_id,conversation_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS conversation_message_student_links (
      page_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      linked_by TEXT NOT NULL,
      linked_at TEXT NOT NULL,
      PRIMARY KEY(page_id,conversation_id,message_id)
    );
    CREATE TABLE IF NOT EXISTS student_summary_snapshots (
      student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      valid_until TEXT
    );
    CREATE TABLE IF NOT EXISTS student_audit_events (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      changed_by TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS facts_summary_insert AFTER INSERT ON student_facts BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS facts_summary_update AFTER UPDATE ON student_facts BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS issues_summary_insert AFTER INSERT ON student_issues BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS issues_summary_update AFTER UPDATE ON student_issues BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS assignments_summary_insert AFTER INSERT ON student_assignments BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS assignments_summary_update AFTER UPDATE ON student_assignments BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS submissions_summary_insert AFTER INSERT ON student_submissions BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS submissions_summary_update AFTER UPDATE ON student_submissions BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS reviews_summary_insert AFTER INSERT ON student_review_sessions BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS actions_summary_insert AFTER INSERT ON issue_practice_actions BEGIN
      DELETE FROM student_summary_snapshots WHERE student_id=(SELECT student_id FROM student_issues WHERE id=NEW.issue_id);
    END;
    CREATE TRIGGER IF NOT EXISTS student_contexts_summary_insert AFTER INSERT ON student_contexts BEGIN
      UPDATE students SET revision=revision+1,updated_at=NEW.updated_at WHERE id=NEW.student_id AND page_id=NEW.page_id;
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
    CREATE TRIGGER IF NOT EXISTS student_contexts_summary_update AFTER UPDATE ON student_contexts BEGIN
      UPDATE students SET revision=revision+1,updated_at=NEW.updated_at WHERE id=NEW.student_id AND page_id=NEW.page_id;
      DELETE FROM student_summary_snapshots WHERE student_id=NEW.student_id;
    END;
  `);

  // Forward-only compatibility for databases created by older demo builds.
  ensureColumn(db, 'generations', 'conversation_id', 'TEXT');
  ensureColumn(db, 'generations', 'knowledge_version_id', 'TEXT');
  ensureColumn(db, 'generations', 'status', "TEXT NOT NULL DEFAULT 'succeeded'");
  ensureColumn(db, 'generations', 'updated_at', 'TEXT');
  ensureColumn(db, 'students', 'revision', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'student_review_sessions', 'status', "TEXT NOT NULL DEFAULT 'draft'");
  ensureColumn(db, 'student_review_sessions', 'confirmed_at', 'TEXT');
  ensureColumn(db, 'student_review_sessions', 'confirmation_evidence', 'TEXT');
  ensureColumn(db, 'student_assignments', 'revision', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'issue_occurrences', 'source_key', 'TEXT');
  ensureColumn(db, 'issue_occurrences', 'source_group_key', 'TEXT');
  ensureColumn(db, 'issue_occurrences', 'revision', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'student_proposals', 'source_occurred_at', 'TEXT');
  ensureColumn(db, 'student_facts', 'conflict_key', 'TEXT');
  ensureColumn(db, 'student_facts', 'conflict_status', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'student_facts', 'verification_status', "TEXT NOT NULL DEFAULT 'confirmed'");
  ensureColumn(db, 'student_facts', 'sensitivity', "TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn(db, 'student_facts', 'use_requested', 'INTEGER NOT NULL DEFAULT 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_facts_conflict_key ON student_facts(student_id,conflict_key,conflict_status);');
  ensureColumn(db, 'issue_evidence', 'issue_id', 'TEXT');
  db.exec(`UPDATE issue_evidence SET issue_id=(SELECT issue_id FROM issue_occurrences WHERE id=issue_evidence.occurrence_id)
    WHERE issue_id IS NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_issue_evidence_source_issue
    ON issue_evidence(issue_id,conversation_id,message_id) WHERE conversation_id IS NOT NULL AND message_id IS NOT NULL;`);
  migrateLegacyEventPrivacy(db);
  migrateFactUseIntent(db);
  migrateReviewOccurrenceIndex(db);
  migrateCurrentConversationLinks(db);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_occurrence_source_key
    ON issue_occurrences(issue_id, source_key) WHERE source_key IS NOT NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_occurrence_source_group
    ON issue_occurrences(issue_id, source_group_key) WHERE source_group_key IS NOT NULL;`);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS issue_evidence_validate_insert
    BEFORE INSERT ON issue_evidence BEGIN
      SELECT CASE WHEN NEW.issue_id IS NULL OR NEW.issue_id IS NOT (SELECT issue_id FROM issue_occurrences WHERE id=NEW.occurrence_id)
        THEN RAISE(ABORT,'evidence issue must match its occurrence') END;
      SELECT CASE WHEN (NEW.conversation_id IS NULL) <> (NEW.message_id IS NULL)
        THEN RAISE(ABORT,'evidence message source must include conversation and message IDs') END;
      SELECT CASE WHEN NEW.conversation_id IS NULL AND NEW.review_session_id IS NULL
        THEN RAISE(ABORT,'evidence must reference a message or review session') END;
    END;
    CREATE TRIGGER IF NOT EXISTS issue_evidence_validate_update
    BEFORE UPDATE OF issue_id,occurrence_id,conversation_id,message_id,review_session_id ON issue_evidence BEGIN
      SELECT CASE WHEN NEW.issue_id IS NULL OR NEW.issue_id IS NOT (SELECT issue_id FROM issue_occurrences WHERE id=NEW.occurrence_id)
        THEN RAISE(ABORT,'evidence issue must match its occurrence') END;
      SELECT CASE WHEN (NEW.conversation_id IS NULL) <> (NEW.message_id IS NULL)
        THEN RAISE(ABORT,'evidence message source must include conversation and message IDs') END;
      SELECT CASE WHEN NEW.conversation_id IS NULL AND NEW.review_session_id IS NULL
        THEN RAISE(ABORT,'evidence must reference a message or review session') END;
    END;
    CREATE TRIGGER IF NOT EXISTS issue_occurrence_sync_evidence_issue
    AFTER UPDATE OF issue_id ON issue_occurrences BEGIN
      UPDATE issue_evidence SET issue_id=NEW.issue_id WHERE occurrence_id=NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS practice_action_require_source
    BEFORE INSERT ON issue_practice_actions BEGIN
      SELECT CASE WHEN NEW.review_session_id IS NULL AND NEW.source_message_id IS NULL
        THEN RAISE(ABORT,'practice action must reference teacher evidence') END;
      SELECT CASE WHEN NEW.review_session_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM student_review_sessions r JOIN student_issues i ON i.id=NEW.issue_id
        WHERE r.id=NEW.review_session_id AND r.student_id=i.student_id AND r.status='confirmed'
      ) AND NOT EXISTS (
        SELECT 1 FROM conversation_message_cache m JOIN students s ON s.page_id=m.page_id
          JOIN student_issues i ON i.student_id=s.id
        WHERE m.message_id=NEW.source_message_id AND m.sender='staff' AND i.id=NEW.issue_id
      ) THEN RAISE(ABORT,'practice action requires confirmed teacher evidence') END;
      SELECT CASE WHEN NEW.review_session_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM conversation_message_cache m JOIN students s ON s.page_id=m.page_id
          JOIN student_issues i ON i.student_id=s.id
        WHERE m.message_id=NEW.source_message_id AND m.sender='staff' AND i.id=NEW.issue_id
      ) THEN RAISE(ABORT,'practice action requires a staff-authored source message') END;
    END;
  `);
}

function migrateLegacyEventPrivacy(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS backend_schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL);`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const applied = db.prepare('SELECT 1 FROM backend_schema_migrations WHERE name=?').get('student_event_privacy_v1');
    if (applied) { db.exec('COMMIT'); return; }
    db.prepare(`UPDATE student_facts SET sensitivity='private',use_in_suggestions=0
      WHERE kind='event' AND sensitivity='normal'`).run();
    db.prepare('INSERT INTO backend_schema_migrations(name,applied_at) VALUES (?,?)')
      .run('student_event_privacy_v1', new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function migrateFactUseIntent(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS backend_schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL);`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const applied=db.prepare('SELECT 1 FROM backend_schema_migrations WHERE name=?').get('student_fact_use_intent_v1');
    if(applied) { db.exec('COMMIT'); return; }
    db.prepare(`UPDATE student_facts SET use_requested=CASE WHEN conflict_status='pending' THEN 1 ELSE use_in_suggestions END`).run();
    db.prepare('INSERT INTO backend_schema_migrations(name,applied_at) VALUES (?,?)')
      .run('student_fact_use_intent_v1',new Date().toISOString());
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}

function migrateReviewOccurrenceIndex(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS backend_schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL);`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const applied=db.prepare('SELECT 1 FROM backend_schema_migrations WHERE name=?').get('review_occurrence_nonunique_index_v1');
    if(applied) { db.exec('COMMIT'); return; }
    db.exec(`DROP INDEX IF EXISTS idx_occurrences_review_issue;
      CREATE INDEX IF NOT EXISTS idx_occurrences_review_issue ON issue_occurrences(issue_id,review_session_id);`);
    db.prepare('INSERT INTO backend_schema_migrations(name,applied_at) VALUES (?,?)')
      .run('review_occurrence_nonunique_index_v1',new Date().toISOString());
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}

function migrateCurrentConversationLinks(db: DatabaseSync) {
  db.prepare(`INSERT OR IGNORE INTO student_conversation_link_history
    (id,page_id,customer_id,conversation_id,student_id,valid_from,valid_to,source,confirmed_by)
    SELECT 'link-history:'||l.page_id||':'||l.conversation_id||':'||l.linked_at,l.page_id,c.customer_id,
      l.conversation_id,l.student_id,l.linked_at,NULL,'legacy_link',l.linked_by
    FROM student_conversation_links l LEFT JOIN conversations c ON c.id=l.conversation_id AND c.page_id=l.page_id`).run();
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (tableInfo.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}
