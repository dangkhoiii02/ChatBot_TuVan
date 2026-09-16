const test = require('node:test');
const assert = require('node:assert');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { createHttpServer } = require('../../src/api/server');
const { JobWorker } = require('../../src/jobs/worker');
const { simulateRequest } = require('../helpers/http_simulator');

test('Widget Flow: Full lifecycle generate -> poll -> edit -> feedback -> outdated warning', async () => {
  const db = createDatabaseConnection(':memory:');
  runMigrations(db);

  // Setup active version v1
  db.prepare(`
    INSERT INTO knowledge_versions (id, status, checksum, approved_by_label, published_at, created_at)
    VALUES ('v1', 'published', 'chk1', 'admin', datetime('now'), datetime('now'))
  `).run();
  db.prepare(`UPDATE knowledge_state SET active_version_id = 'v1', revision = 1 WHERE id = 1`).run();

  const server = createHttpServer(db);
  const worker = new JobWorker(db, { concurrencyLimit: 1 });

  const jobToken = 'secret_widget_token_abc';
  const idemKey = 'widget_req_001';

  // 1. Client calls POST /api/v1/generate
  const genRes = await simulateRequest(server, {
    path: '/api/v1/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
      'X-Job-Token': jobToken
    },
    body: {
      message: 'Thầy cho em hỏi cách tập chạy ngón 4-5 không bị cứng nhé.',
      context: { pronoun: 'thầy - em' }
    }
  });

  assert.strictEqual(genRes.statusCode, 202);
  const jobId = genRes.json.job_id;
  assert.ok(jobId);

  // 2. Worker executes job
  const claimed = worker.claimNextJob();
  assert.ok(claimed);
  await worker.executeJob(claimed);

  // 3. Client polls GET /api/v1/jobs/:id
  const pollRes = await simulateRequest(server, {
    path: `/api/v1/jobs/${jobId}`,
    method: 'GET',
    headers: { 'X-Job-Token': jobToken }
  });

  assert.strictEqual(pollRes.statusCode, 200);
  assert.strictEqual(pollRes.json.state, 'succeeded');
  assert.strictEqual(pollRes.json.is_outdated_version, false);
  assert.ok(pollRes.json.result.replies.length > 0);

  // 4. Client submits edited feedback
  const chosenReply = pollRes.json.result.replies[0].content;
  const editedReply = chosenReply + ' (Đã sửa thêm chi tiết tập 15 phút)';

  const fbRes1 = await simulateRequest(server, {
    path: `/api/v1/jobs/${jobId}/feedback`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Job-Token': jobToken
    },
    body: {
      selected_reply: chosenReply,
      edited_reply: editedReply
    }
  });

  assert.strictEqual(fbRes1.statusCode, 201);
  assert.ok(fbRes1.json.feedback_id);

  // 5. Anti-duplicate feedback: submitting again returns 200 without duplicate row
  const fbRes2 = await simulateRequest(server, {
    path: `/api/v1/jobs/${jobId}/feedback`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Job-Token': jobToken
    },
    body: {
      selected_reply: chosenReply,
      edited_reply: editedReply
    }
  });

  assert.strictEqual(fbRes2.statusCode, 200);
  const fbCount = db.prepare('SELECT count(*) as c FROM feedback').get().c;
  assert.strictEqual(fbCount, 1, 'Feedback không bị lưu trùng lặp');

  // 6. Now publish v2, and verify querying old job returns is_outdated_version = true
  db.prepare(`
    INSERT INTO knowledge_versions (id, status, checksum, approved_by_label, published_at, created_at)
    VALUES ('v2', 'published', 'chk2', 'admin', datetime('now'), datetime('now'))
  `).run();
  db.prepare(`UPDATE knowledge_state SET active_version_id = 'v2', revision = 2 WHERE id = 1`).run();

  const outdatedPollRes = await simulateRequest(server, {
    path: `/api/v1/jobs/${jobId}`,
    method: 'GET',
    headers: { 'X-Job-Token': jobToken }
  });

  assert.strictEqual(outdatedPollRes.statusCode, 200);
  assert.strictEqual(outdatedPollRes.json.is_outdated_version, true, 'Job tạo từ v1 phải có cờ is_outdated_version khi active là v2');
});
