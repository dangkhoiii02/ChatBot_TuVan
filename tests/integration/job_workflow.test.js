const test = require('node:test');
const assert = require('node:assert');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { createJob, getJobDetails } = require('../../src/jobs/queue');
const { JobWorker } = require('../../src/jobs/worker');

function setupTestEnvironment() {
  const db = createDatabaseConnection(':memory:');
  runMigrations(db);

  // Setup active version
  const verId = 'ver_test_01';
  db.prepare(`
    INSERT INTO knowledge_versions (id, parent_id, status, checksum, approved_by_label, approved_at, published_at, created_at)
    VALUES (?, NULL, 'published', 'chk', 'admin', datetime('now'), datetime('now'), datetime('now'))
  `).run(verId);

  db.prepare(`
    INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
    VALUES (?, 'persona-main', 'persona', '{"markdown":"# Persona test"}', 'src', 'hash')
  `).run(verId);

  db.prepare(`
    UPDATE knowledge_state SET active_version_id = ?, revision = 2, updated_at = datetime('now') WHERE id = 1
  `).run(verId);

  return { db, verId };
}

test('Job Workflow: Idempotent creation, payload conflict, and token verification', () => {
  const { db } = setupTestEnvironment();
  const token = 'token_abc_1234567890';
  const idemKey = 'idem_key_001';

  // 1. Create job
  const res1 = createJob(db, {
    message: 'Chào thầy, em muốn hỏi bài.',
    context: { pronoun: 'thầy - em' },
    idempotencyKey: idemKey,
    jobToken: token
  });
  assert.strictEqual(res1.idempotent, false);
  assert.ok(res1.job_id);

  // 2. Repeat with same key, same payload, same token -> returns existing job
  const res2 = createJob(db, {
    message: 'Chào thầy, em muốn hỏi bài.',
    context: { pronoun: 'thầy - em' },
    idempotencyKey: idemKey,
    jobToken: token
  });
  assert.strictEqual(res2.idempotent, true);
  assert.strictEqual(res2.job_id, res1.job_id);

  // 3. Same key with DIFFERENT payload -> 409 Conflict
  assert.throws(() => {
    createJob(db, {
      message: 'Tin nhắn khác hoàn toàn!',
      context: {},
      idempotencyKey: idemKey,
      jobToken: token
    });
  }, (err) => err.status === 409);

  // 4. Read job with correct token
  const details = getJobDetails(db, res1.job_id, token);
  assert.strictEqual(details.id, res1.job_id);
  assert.strictEqual(details.state, 'queued');

  // 5. Read job with WRONG token -> 403 Forbidden
  assert.throws(() => {
    getJobDetails(db, res1.job_id, 'wrong_token');
  }, (err) => err.status === 403);
});

test('Job Workflow: Worker processes job to completion with pinned version', async () => {
  const { db, verId } = setupTestEnvironment();
  const token = 'token_worker_test';

  const job = createJob(db, {
    message: 'Thầy cho em xin bảo lưu 30 ngày nhé',
    context: { pronoun: 'thầy - em' },
    jobToken: token
  });

  const worker = new JobWorker(db, { concurrencyLimit: 1, pollIntervalMs: 50 });
  
  // Claim and execute one job
  const claimed = worker.claimNextJob();
  assert.ok(claimed);
  assert.strictEqual(claimed.id, job.job_id);
  assert.strictEqual(claimed.attempt, 1);

  await worker.executeJob(claimed);

  // Verify status is succeeded
  const details = getJobDetails(db, job.job_id, token);
  assert.strictEqual(details.state, 'succeeded');
  assert.ok(details.result);
  assert.strictEqual(details.result.knowledge_version_id, verId);
  assert.ok(details.result.replies.length > 0);
});

test('Job Workflow: Stale lease recovery when previous worker died', () => {
  const { db } = setupTestEnvironment();
  const token = 'token_lease_test';

  const job = createJob(db, {
    message: 'Test lease recovery',
    jobToken: token
  });

  // Simulate a dead worker that took lease that expired in the past
  db.prepare(`
    UPDATE jobs
    SET state = 'running',
        lease_until = datetime('now', '-10 seconds'),
        attempt = 1
    WHERE id = ?
  `).run(job.job_id);

  const worker = new JobWorker(db, { concurrencyLimit: 1 });
  const recovered = worker.claimNextJob();

  assert.ok(recovered, 'Worker mới phải thu hồi được job có lease đã hết hạn');
  assert.strictEqual(recovered.id, job.job_id);
  assert.strictEqual(recovered.attempt, 2, 'Attempt phải tăng lên 2');
});
