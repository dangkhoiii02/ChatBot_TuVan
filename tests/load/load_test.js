const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { createHttpServer } = require('../../src/api/server');
const { importKnowledgeBatch } = require('../../src/knowledge/importer');
const { simulateRequest } = require('../helpers/http_simulator');

function calculatePercentile(values, p) {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * values.length) - 1;
  return values[Math.max(0, index)];
}

async function runLoadTest() {
  console.log('====================================================');
  console.log('  CHẠY BÀI KIỂM THỬ TẢI (LOAD TEST)');
  console.log('  Mục tiêu: 10 clients đồng thời, Import 1.000 mục,');
  console.log('  Đo p95 độ trễ API nhận job, kiểm tra lỗi khóa DB.');
  console.log('====================================================');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load_test_'));
  const dbPath = path.join(tmpDir, 'load.db');
  const db = createDatabaseConnection(dbPath);
  runMigrations(db);

  // Setup initial active version
  db.prepare(`
    INSERT INTO knowledge_versions (id, status, checksum, approved_by_label, published_at, created_at)
    VALUES ('v-load-init', 'published', 'chk', 'admin', datetime('now'), datetime('now'))
  `).run();
  db.prepare(`UPDATE knowledge_state SET active_version_id = 'v-load-init', revision = 1 WHERE id = 1`).run();

  const server = createHttpServer(db);

  // Prepare 1,000 items batch folder
  console.log('[Tải] Chuẩn bị gói dữ liệu 1.000 mục chính sách...');
  const batchDir = path.join(tmpDir, 'large_batch');
  fs.mkdirSync(batchDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const policies = [];
  for (let i = 1; i <= 1000; i++) {
    policies.push(JSON.stringify({
      id: `policy-load-${String(i).padStart(4, '0')}`,
      source_ref: 'load_test',
      collected_at: nowIso,
      permission_status: 'confirmed',
      anonymized: true,
      review_status: 'approved',
      approved_by: 'load_tester',
      approved_at: nowIso,
      title: `Chính sách tải thử số ${i}`,
      policy_key: `key_${i}`,
      scope: 'load_scope',
      rule_text: `Điều khoản quy định chi tiết cho mục tải ${i}`
    }));
  }
  fs.writeFileSync(path.join(batchDir, 'policies.jsonl'), policies.join('\n') + '\n', 'utf-8');
  fs.writeFileSync(path.join(batchDir, 'manifest.json'), JSON.stringify({
    schema_version: '1.0',
    batch_id: 'batch-load-1000',
    submitted_at: nowIso,
    collected_by: 'LOAD_RUNNER',
    mode: 'full',
    files: ['policies.jsonl'],
    deleted_item_ids: []
  }, null, 2), 'utf-8');

  console.log('[Tải] Bắt đầu chạy song song 10 client gửi requests và thực hiện Import 1.000 mục...');
  const startTime = Date.now();
  const latencies = [];
  let dbLockErrors = 0;
  let successfulRequests = 0;

  // Background import running concurrently with client requests
  const importPromise = new Promise((resolve) => {
    try {
      const impRes = importKnowledgeBatch(db, batchDir);
      resolve(impRes);
    } catch (err) {
      if (err.message && err.message.includes('SQLITE_BUSY')) dbLockErrors++;
      resolve({ success: false, error: err.message });
    }
  });

  // 10 concurrent clients, each sending 5 requests (total 50 requests)
  const clientPromises = [];
  for (let c = 0; c < 10; c++) {
    const clientTask = (async () => {
      for (let r = 0; r < 5; r++) {
        const reqStart = Date.now();
        try {
          const res = await simulateRequest(server, {
            path: '/api/v1/generate',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': `load_client_${c}_req_${r}_${Date.now()}`,
              'X-Job-Token': `tok_client_${c}_${r}`
            },
            body: {
              message: `Tin nhắn kiểm thử tải từ client ${c} lần ${r}`,
              context: { pronoun: 'thầy - em' }
            }
          });

          latencies.push(Date.now() - reqStart);
          if (res.statusCode === 202) {
            successfulRequests++;
          }
        } catch (err) {
          if (err.message && err.message.includes('SQLITE_BUSY')) dbLockErrors++;
        }
      }
    })();
    clientPromises.push(clientTask);
  }

  await Promise.all([...clientPromises, importPromise]);
  const totalDuration = Date.now() - startTime;

  // Compute metrics
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const queueCount = db.prepare('SELECT count(*) as c FROM jobs').get().c;

  console.log('\n================ KẾT QUẢ KIỂM THỬ TẢI ================');
  console.log(`Thời gian chạy: ${totalDuration} ms`);
  console.log(`Số lượng request: ${latencies.length} (Thành công: ${successfulRequests})`);
  console.log(`Độ trễ API tiếp nhận job (p50): ${p50} ms`);
  console.log(`Độ trễ API tiếp nhận job (p95): ${p95} ms (Mục tiêu: < 500 ms)`);
  console.log(`Độ trễ API tiếp nhận job (p99): ${p99} ms`);
  console.log(`Độ dài hàng đợi (Queue count): ${queueCount}`);
  console.log(`Số lỗi khóa DB (SQLITE_BUSY): ${dbLockErrors} (Mục tiêu: 0)`);
  console.log('====================================================\n');

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const passed = p95 < 500 && dbLockErrors === 0 && successfulRequests > 0;
  if (!passed) {
    throw new Error('Kiểm thử tải không đạt tiêu chí (p95 >= 500ms hoặc có lỗi khóa DB).');
  }
  return { p50, p95, p99, successfulRequests, dbLockErrors };
}

if (require.main === module) {
  runLoadTest().catch(err => {
    console.error('[Lỗi bài kiểm thử tải]:', err.message);
    process.exit(1);
  });
}

module.exports = { runLoadTest };
