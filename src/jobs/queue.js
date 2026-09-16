const crypto = require('node:crypto');
const config = require('../config');
const { hashJobToken, verifyJobToken } = require('../utils/crypto');

function createJob(db, { message, context = {}, idempotencyKey = null, jobToken = null, model = null }) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    const err = new Error('Nội dung tin nhắn học viên (message) không được để trống.');
    err.status = 400;
    throw err;
  }

  if (!jobToken || typeof jobToken !== 'string') {
    const err = new Error('Yêu cầu cung cấp X-Job-Token hợp lệ từ client.');
    err.status = 400;
    throw err;
  }

  const tokenHash = hashJobToken(jobToken);

  // 1. Check knowledge state
  const stateRow = db.prepare('SELECT active_version_id FROM knowledge_state WHERE id = 1').get();
  if (!stateRow || !stateRow.active_version_id) {
    const err = new Error('Hệ thống chưa có phiên bản tri thức active. Vui lòng nạp và publish tri thức trước khi tạo phản hồi.');
    err.status = 503;
    err.code = 'NO_ACTIVE_KNOWLEDGE';
    throw err;
  }
  const pinnedKnowledgeVersionId = stateRow.active_version_id;

  // 2. Check queue limit
  const countRow = db.prepare("SELECT count(*) as count FROM jobs WHERE state IN ('queued', 'running')").get();
  if (countRow.count >= config.QUEUE_LIMIT) {
    const err = new Error(`Hàng đợi đã đầy (${countRow.count}/${config.QUEUE_LIMIT} jobs). Vui lòng thử lại sau ít phút.`);
    err.status = 429;
    err.code = 'QUEUE_FULL';
    throw err;
  }

  const payload = {
    message: message.trim(),
    context: context || {},
    model: model || config.GEMINI_MODEL,
    knowledge_version_id: pinnedKnowledgeVersionId
  };
  const payloadJson = JSON.stringify(payload);

  // 3. Check idempotency if key provided
  if (idempotencyKey) {
    const existingJob = db.prepare('SELECT * FROM jobs WHERE idempotency_key = ?').get(idempotencyKey);
    if (existingJob) {
      // Must verify token
      const tokenValid = verifyJobToken(jobToken, existingJob.access_token_hash);
      if (!tokenValid) {
        const err = new Error('Token không khớp với yêu cầu trước đó của Idempotency-Key này.');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      // Check payload equivalence
      let existingPayload;
      try {
        existingPayload = JSON.parse(existingJob.payload_json);
      } catch (e) {
        existingPayload = {};
      }

      const sameMessage = existingPayload.message === payload.message;
      const sameContext = JSON.stringify(existingPayload.context || {}) === JSON.stringify(payload.context || {});
      if (!sameMessage || !sameContext) {
        const err = new Error('Xung đột Idempotency-Key: Đã tồn tại yêu cầu với cùng key nhưng nội dung payload khác.');
        err.status = 409;
        err.code = 'IDEMPOTENCY_CONFLICT';
        throw err;
      }

      return {
        job_id: existingJob.id,
        state: existingJob.state,
        idempotent: true
      };
    }
  }

  // 4. Create new job
  const jobId = 'job_' + crypto.randomBytes(16).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  db.prepare(`
    INSERT INTO jobs (
      id, access_token_hash, payload_json, state, attempt, max_attempts,
      run_after, lease_until, result_id, idempotency_key, error_message,
      created_at, updated_at, expires_at
    ) VALUES (
      ?, ?, ?, 'queued', 0, ?,
      datetime('now'), NULL, NULL, ?, NULL,
      datetime('now'), datetime('now'), ?
    )
  `).run(
    jobId,
    tokenHash,
    payloadJson,
    config.MAX_RETRY_ATTEMPTS + 1, // max attempts = 1 initial + max retries
    idempotencyKey,
    expiresAt.toISOString()
  );

  return {
    job_id: jobId,
    state: 'queued',
    idempotent: false
  };
}

function getJobDetails(db, jobId, jobToken) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) {
    const err = new Error(`Không tìm thấy công việc với ID: ${jobId}`);
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Verify access token
  const tokenValid = verifyJobToken(jobToken, job.access_token_hash);
  if (!tokenValid) {
    const err = new Error('Mã truy cập kết quả (X-Job-Token) không hợp lệ hoặc bị từ chối.');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  let result = null;
  let isOutdatedVersion = false;

  if (job.result_id) {
    const gen = db.prepare('SELECT * FROM generations WHERE id = ?').get(job.result_id);
    if (gen) {
      let replies = [];
      try { replies = JSON.parse(gen.replies_json || '[]'); } catch (e) {}

      result = {
        generation_id: gen.id,
        sensitivity: gen.sensitivity,
        flag_reason: gen.flag_reason,
        replies: replies,
        latency_ms: gen.latency_ms,
        knowledge_version_id: gen.knowledge_version_id,
        created_at: gen.created_at
      };

      // Check if version is outdated compared to active version
      const state = db.prepare('SELECT active_version_id FROM knowledge_state WHERE id = 1').get();
      if (state && state.active_version_id && state.active_version_id !== gen.knowledge_version_id) {
        isOutdatedVersion = true;
      }
    }
  }

  return {
    id: job.id,
    state: job.state,
    attempt: job.attempt,
    result: result,
    error_message: job.error_message,
    is_outdated_version: isOutdatedVersion,
    created_at: job.created_at,
    updated_at: job.updated_at
  };
}

module.exports = {
  createJob,
  getJobDetails
};
