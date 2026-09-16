-- Migration 001: Initial Schema for Sustainable SQLite Architecture

CREATE TABLE IF NOT EXISTS knowledge_versions (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  checksum TEXT NOT NULL,
  approved_by_label TEXT,
  approved_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  version_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('persona', 'policy', 'faq', 'conversation', 'safety_rule')),
  content_json TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (version_id, item_id),
  FOREIGN KEY (version_id) REFERENCES knowledge_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_version_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (active_version_id) REFERENCES knowledge_versions(id)
);

-- Initialize single row for knowledge_state if not exists
INSERT OR IGNORE INTO knowledge_state (id, active_version_id, revision, updated_at)
VALUES (1, NULL, 1, datetime('now'));

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'succeeded', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TEXT NOT NULL,
  lease_until TEXT,
  result_id TEXT,
  idempotency_key TEXT UNIQUE,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT,
  input_text TEXT NOT NULL,
  context_json TEXT,
  knowledge_version_id TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  sensitivity TEXT CHECK (sensitivity IN ('xanh', 'vang', 'do')),
  flag_reason TEXT,
  replies_json TEXT,
  source_ids_json TEXT,
  token_usage_json TEXT,
  latency_ms INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (knowledge_version_id) REFERENCES knowledge_versions(id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL UNIQUE,
  selected_reply TEXT,
  edited_reply TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'validated', 'imported', 'rejected')),
  errors_json TEXT,
  candidate_version_id TEXT,
  created_at TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_state_run_after ON jobs(state, run_after);
CREATE INDEX IF NOT EXISTS idx_jobs_lease_until ON jobs(lease_until);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_version_type ON knowledge_items(version_id, type);
CREATE INDEX IF NOT EXISTS idx_generations_version ON generations(knowledge_version_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
