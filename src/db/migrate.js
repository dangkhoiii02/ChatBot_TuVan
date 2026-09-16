const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('./index');

function runMigrations(db) {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  // Create migrations tracker table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT id FROM _migrations').all();
  const appliedSet = new Set(appliedRows.map(r => r.id));

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const newlyApplied = [];

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Execute in a transaction
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(sql);
        const stmt = db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, datetime('now'));");
        stmt.run(file);
        db.exec('COMMIT;');
        newlyApplied.push(file);
        console.log(`[Migration] Đã áp dụng: ${file}`);
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error(`[Migration LỖI] Khi chạy ${file}:`, err);
        throw err;
      }
    }
  }

  return newlyApplied;
}

if (require.main === module) {
  const db = getDb();
  try {
    const applied = runMigrations(db);
    console.log(`[Migration] Hoàn tất. ${applied.length} migration mới được áp dụng.`);
  } catch (err) {
    console.error('[Migration] Thất bại:', err.message);
    process.exit(1);
  }
}

module.exports = {
  runMigrations
};
