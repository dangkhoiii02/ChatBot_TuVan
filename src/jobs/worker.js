const crypto = require('node:crypto');
const config = require('../config');
const { getKnowledgeContext } = require('../knowledge/retriever');
const { getProvider } = require('../providers');

class JobWorker {
  constructor(db, options = {}) {
    this.db = db;
    this.concurrencyLimit = options.concurrencyLimit || config.CONCURRENCY_LIMIT;
    this.pollIntervalMs = options.pollIntervalMs || 250;
    this.isRunning = false;
    this.isStopping = false;
    this.activeJobs = new Set();
    this.pollTimer = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isStopping = false;
    this.scheduleNextPoll(0);
  }

  scheduleNextPoll(delayMs = this.pollIntervalMs) {
    if (!this.isRunning || this.isStopping) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.poll(), delayMs);
  }

  async poll() {
    if (!this.isRunning || this.isStopping) return;

    try {
      while (this.activeJobs.size < this.concurrencyLimit && !this.isStopping) {
        const job = this.claimNextJob();
        if (!job) break;

        const jobPromise = this.executeJob(job).finally(() => {
          this.activeJobs.delete(jobPromise);
          this.scheduleNextPoll(0);
        });

        this.activeJobs.add(jobPromise);
      }
    } catch (err) {
      console.error('[Worker Poll Error]:', err);
    } finally {
      this.scheduleNextPoll(this.pollIntervalMs);
    }
  }

  claimNextJob() {
    // 1. Find candidate job
    const candidate = this.db.prepare(`
      SELECT id, payload_json, attempt, max_attempts, created_at
      FROM jobs
      WHERE (
        state = 'queued'
        OR (state = 'running' AND lease_until < datetime('now'))
      )
      AND run_after <= datetime('now')
      AND attempt < max_attempts
      ORDER BY run_after ASC, created_at ASC
      LIMIT 1
    `).get();

    if (!candidate) return null;

    // Check overall job deadline
    const createdAtMs = new Date(candidate.created_at + (candidate.created_at.includes('Z') ? '' : 'Z')).getTime();
    const jobAge = Date.now() - createdAtMs;
    if (jobAge > config.MAX_JOB_DEADLINE_MS) {
      this.db.prepare(`
        UPDATE jobs
        SET state = 'failed',
            error_message = 'Vượt quá tổng thời hạn xử lý (Overall deadline 120s exceeded).',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(candidate.id);
      return this.claimNextJob(); // Try claiming another
    }

    // 2. Atomic lease claim
    const leaseDurationSeconds = Math.ceil(config.CALL_TIMEOUT_MS / 1000) + 5;
    const stmt = this.db.prepare(`
      UPDATE jobs
      SET state = 'running',
          lease_until = datetime('now', ?),
          attempt = attempt + 1,
          updated_at = datetime('now')
      WHERE id = ? AND attempt = ?
    `);

    const result = stmt.run(`+${leaseDurationSeconds} seconds`, candidate.id, candidate.attempt);
    if (result.changes === 0) {
      // Another worker claimed this job concurrently
      return null;
    }

    return {
      id: candidate.id,
      payload_json: candidate.payload_json,
      attempt: candidate.attempt + 1,
      max_attempts: candidate.max_attempts
    };
  }

  async executeJob(job) {
    let payload;
    try {
      payload = JSON.parse(job.payload_json);
    } catch (err) {
      this.db.prepare(`
        UPDATE jobs
        SET state = 'failed',
            error_message = 'Lỗi phân tích JSON payload của job.',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(job.id);
      return;
    }

    try {
      // 1. Retrieve knowledge for pinned version
      const knowledgeContext = getKnowledgeContext(
        this.db,
        payload.knowledge_version_id,
        payload.message,
        payload.context
      );

      // 2. Call AI Provider
      const provider = getProvider();
      const output = await provider.generate({
        message: payload.message,
        context: payload.context,
        knowledge: knowledgeContext,
        model: payload.model,
        timeoutMs: config.CALL_TIMEOUT_MS
      });

      // 3. Save generation record
      const generationId = 'gen_' + crypto.randomBytes(16).toString('hex');
      const nowIso = new Date().toISOString();

      this.db.exec('BEGIN TRANSACTION;');
      try {
        this.db.prepare(`
          INSERT INTO generations (
            id, idempotency_key, input_text, context_json, knowledge_version_id,
            model, status, sensitivity, flag_reason, replies_json, source_ids_json,
            token_usage_json, latency_ms, error_code, created_at, updated_at
          ) VALUES (
            ?, NULL, ?, ?, ?,
            ?, 'succeeded', ?, ?, ?, ?,
            ?, ?, NULL, ?, ?
          )
        `).run(
          generationId,
          payload.message,
          JSON.stringify(payload.context || {}),
          payload.knowledge_version_id,
          payload.model || 'default',
          output.sensitivity,
          output.flag_reason || null,
          JSON.stringify(output.replies || []),
          JSON.stringify(knowledgeContext.policies.map(p => p.id)),
          JSON.stringify(output.token_usage || {}),
          output.latency_ms || 0,
          nowIso,
          nowIso
        );

        this.db.prepare(`
          UPDATE jobs
          SET state = 'succeeded',
              result_id = ?,
              error_message = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(generationId, job.id);

        this.db.exec('COMMIT;');
      } catch (dbErr) {
        this.db.exec('ROLLBACK;');
        throw dbErr;
      }
    } catch (err) {
      console.warn(`[Job ${job.id} Attempt ${job.attempt} Thất bại]:`, err.message);

      const isTemporary = err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR' || err.code === 'RATE_LIMIT' || err.status === 429 || (err.status >= 500 && err.status < 600);

      if (isTemporary && job.attempt < job.max_attempts) {
        // Exponential backoff with jitter
        const baseDelaySeconds = Math.pow(2, job.attempt); // 2s, 4s...
        const jitterSeconds = Math.random();
        const totalDelaySeconds = Math.ceil(baseDelaySeconds + jitterSeconds);

        this.db.prepare(`
          UPDATE jobs
          SET state = 'queued',
              run_after = datetime('now', ?),
              error_message = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(`+${totalDelaySeconds} seconds`, err.message, job.id);
      } else {
        // Permanent failure or max attempts reached
        this.db.prepare(`
          UPDATE jobs
          SET state = 'failed',
              error_message = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(err.message, job.id);
      }
    }
  }

  async stop(gracePeriodMs = 5000) {
    this.isStopping = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);

    if (this.activeJobs.size > 0) {
      console.log(`[Worker] Đang chờ ${this.activeJobs.size} công việc đang chạy hoàn tất...`);
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, gracePeriodMs));
      await Promise.race([
        Promise.all(Array.from(this.activeJobs)),
        timeoutPromise
      ]);
    }

    this.isRunning = false;
    console.log('[Worker] Đã dừng an toàn.');
  }
}

module.exports = {
  JobWorker
};
