#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const { getDb } = require('../src/db');
const { sha256 } = require('../src/utils/crypto');

function createBackup(options = {}) {
  const db = getDb();
  const backupDir = options.dir || path.join(process.cwd(), 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const targetFile = options.targetFile || path.join(backupDir, `backup_${timestamp}.db`);
  const metaFile = `${targetFile}.meta.json`;

  console.log(`[Backup] Bắt đầu sao lưu Online SQLite vào: ${targetFile}`);

  // Vacuum into creates an online consistent snapshot safely while WAL is active
  db.exec(`VACUUM INTO '${targetFile.replace(/'/g, "''")}';`);

  // Compute checksum of backup file
  const backupBuffer = fs.readFileSync(targetFile);
  const checksum = sha256(backupBuffer);

  // Read active state from live DB
  const state = db.prepare('SELECT active_version_id, revision FROM knowledge_state WHERE id = 1').get();
  const counts = {
    generations: db.prepare('SELECT count(*) as c FROM generations').get().c,
    feedback: db.prepare('SELECT count(*) as c FROM feedback').get().c,
    jobs: db.prepare('SELECT count(*) as c FROM jobs').get().c,
    knowledge_versions: db.prepare('SELECT count(*) as c FROM knowledge_versions').get().c,
    knowledge_items: db.prepare('SELECT count(*) as c FROM knowledge_items').get().c
  };

  const metadata = {
    source_database: config.DATABASE_PATH,
    backup_file: path.basename(targetFile),
    created_at: now.toISOString(),
    size_bytes: backupBuffer.length,
    sha256_checksum: checksum,
    active_version_id: state?.active_version_id || null,
    revision: state?.revision || 1,
    record_counts: counts
  };

  fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf-8');

  console.log(`✓ Sao lưu thành công!`);
  console.log(`  - File backup: ${targetFile} (${backupBuffer.length} bytes)`);
  console.log(`  - Metadata: ${metaFile}`);
  console.log(`  - Checksum: ${checksum}`);
  console.log(`  - Active Version: ${metadata.active_version_id}`);
  console.log(`  - Thống kê bản ghi:`, counts);

  return { targetFile, metaFile, metadata };
}

if (require.main === module) {
  try {
    const customDir = process.argv[2];
    createBackup({ dir: customDir });
  } catch (err) {
    console.error('[Backup Thất Bại]:', err.message);
    process.exit(1);
  }
}

module.exports = { createBackup };
