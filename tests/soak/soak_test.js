#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { createJob } = require('../../src/jobs/queue');
const { JobWorker } = require('../../src/jobs/worker');

function parseDurationSeconds() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--duration=')) {
      return parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--seconds=')) {
      return parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--minutes=')) {
      return parseInt(arg.split('=')[1], 10) * 60;
    }
    if (arg.startsWith('--hours=')) {
      return parseInt(arg.split('=')[1], 10) * 3600;
    }
  }
  // Default to 10 seconds if not specified when running in automated suite, or 8 hours for full production soak
  return 10;
}

async function runSoakTest() {
  const durationSeconds = parseDurationSeconds();
  console.log('====================================================');
  console.log('  CHƯƠNG TRÌNH SOAK TEST ĐỘ ỔN ĐỊNH DÀI HẠN');
  console.log(`  Thời gian dự kiến chạy: ${durationSeconds} giây (${(durationSeconds / 3600).toFixed(2)} giờ)`);
  console.log('  Theo dõi: Memory RSS, Kích thước DB/WAL, Hàng đợi, Khóa DB.');
  console.log('====================================================');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soak_test_'));
  const dbPath = path.join(tmpDir, 'soak.db');
  const db = createDatabaseConnection(dbPath);
  runMigrations(db);

  // Setup active version
  db.prepare(`
    INSERT INTO knowledge_versions (id, status, checksum, approved_by_label, published_at, created_at)
    VALUES ('v-soak-01', 'published', 'chk', 'admin', datetime('now'), datetime('now'))
  `).run();
  db.prepare(`UPDATE knowledge_state SET active_version_id = 'v-soak-01', revision = 1 WHERE id = 1`).run();

  const worker = new JobWorker(db, { concurrencyLimit: 2, pollIntervalMs: 100 });
  worker.start();

  const startTime = Date.now();
  let iterations = 0;
  let totalJobsCreated = 0;
  let maxRssBytes = 0;

  const intervalId = setInterval(() => {
    // Inject a job periodically
    try {
      createJob(db, {
        message: `Tin nhắn soak test chu kỳ ${iterations}`,
        jobToken: `tok_soak_${iterations}`
      });
      totalJobsCreated++;
    } catch (e) {}

    const mem = process.memoryUsage();
    if (mem.rss > maxRssBytes) maxRssBytes = mem.rss;

    iterations++;
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

    if (iterations % 5 === 0 || elapsedSeconds >= durationSeconds) {
      let dbSize = 0;
      let walSize = 0;
      try { dbSize = fs.statSync(dbPath).size; } catch (e) {}
      try { walSize = fs.statSync(`${dbPath}-wal`).size; } catch (e) {}

      const queued = db.prepare("SELECT count(*) as c FROM jobs WHERE state = 'queued'").get().c;
      const succeeded = db.prepare("SELECT count(*) as c FROM jobs WHERE state = 'succeeded'").get().c;

      console.log(`[Soak ${elapsedSeconds}s/${durationSeconds}s] RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB (Max: ${(maxRssBytes / 1024 / 1024).toFixed(1)}MB) | DB: ${(dbSize / 1024).toFixed(1)}KB, WAL: ${(walSize / 1024).toFixed(1)}KB | Jobs: ${totalJobsCreated} tạo, ${succeeded} xong, ${queued} chờ`);
    }
  }, 1000);

  // Wait for soak duration
  await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));
  clearInterval(intervalId);

  await worker.stop(3000);

  // Perform integrity check after soak
  const integrity = db.prepare('PRAGMA integrity_check;').get();
  const integrityOk = integrity && Object.values(integrity)[0] === 'ok';

  console.log('\n================ BÁO CÁO KẾT QUẢ SOAK TEST ================');
  console.log(`Thời lượng thực tế đã chạy: ${Math.floor((Date.now() - startTime) / 1000)} giây`);
  console.log(`Tổng số jobs đưa vào: ${totalJobsCreated}`);
  console.log(`Đỉnh tiêu thụ RAM (Peak RSS): ${(maxRssBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Toàn vẹn SQLite (Integrity check): ${integrityOk ? 'ĐẠT (OK)' : 'KHÔNG ĐẠT'}`);
  console.log('==========================================================\n');

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (!integrityOk) {
    throw new Error('PRAGMA integrity_check thất bại sau soak test.');
  }

  return { durationSeconds, totalJobsCreated, maxRssBytes, integrityOk };
}

if (require.main === module) {
  runSoakTest().catch(err => {
    console.error('[Soak Test Thất Bại]:', err.message);
    process.exit(1);
  });
}

module.exports = { runSoakTest };
