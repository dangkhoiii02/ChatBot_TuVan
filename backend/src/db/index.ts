import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');
const dbDir = path.resolve(backendRoot, '../storage');
const dbPath = path.join(dbDir, 'app.db');

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
      model TEXT NOT NULL,
      sensitivity TEXT CHECK (sensitivity IN ('xanh', 'vang', 'do')),
      flag_reason TEXT,
      replies_json TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demo_replies (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source_suggestion_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_page_id ON conversations(page_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_demo_replies_conversation_id ON demo_replies(conversation_id);
  `);
}
