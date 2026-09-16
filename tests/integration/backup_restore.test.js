const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { createBackup } = require('../../bin/backup');
const { verifyAndRestore } = require('../../bin/restore');

test('Backup & Restore: Online backup via VACUUM INTO, checksum verification, and integrity check', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup_test_'));
  const liveDbPath = path.join(tmpDir, 'live.db');
  const backupPath = path.join(tmpDir, 'backup.db');
  const restorePath = path.join(tmpDir, 'restored.db');

  // 1. Create live DB and populate data
  const liveDb = createDatabaseConnection(liveDbPath);
  runMigrations(liveDb);

  liveDb.prepare(`
    INSERT INTO knowledge_versions (id, status, checksum, approved_by_label, published_at, created_at)
    VALUES ('v-backup-01', 'published', 'chk', 'admin', datetime('now'), datetime('now'))
  `).run();
  liveDb.prepare(`UPDATE knowledge_state SET active_version_id = 'v-backup-01', revision = 5 WHERE id = 1`).run();

  liveDb.prepare(`
    INSERT INTO generations (id, input_text, knowledge_version_id, model, status, created_at, updated_at)
    VALUES ('gen-01', 'Test message', 'v-backup-01', 'mock', 'succeeded', datetime('now'), datetime('now'))
  `).run();

  // 2. Perform online backup
  // Mock config.DATABASE_PATH and getDb
  const config = require('../../src/config');
  const originalPath = config.DATABASE_PATH;
  config.DATABASE_PATH = liveDbPath;

  const dbModule = require('../../src/db');
  const originalGetDb = dbModule.getDb;
  dbModule.getDb = () => liveDb;

  try {
    const backupResult = createBackup({ targetFile: backupPath });
    assert.strictEqual(fs.existsSync(backupPath), true);
    assert.strictEqual(fs.existsSync(backupResult.metaFile), true);

    // 3. Restore and verify in isolated path
    const restoreResult = verifyAndRestore(backupPath, restorePath);
    assert.strictEqual(restoreResult.success, true);
    assert.strictEqual(restoreResult.active_version_id, 'v-backup-01');
    assert.strictEqual(restoreResult.record_counts.generations, 1);
    assert.strictEqual(restoreResult.record_counts.knowledge_versions, 1);
  } finally {
    dbModule.getDb = originalGetDb;
    config.DATABASE_PATH = originalPath;
    liveDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
