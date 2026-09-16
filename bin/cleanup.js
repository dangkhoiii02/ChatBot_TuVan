#!/usr/bin/env node

const config = require('../src/config');
const { getDb } = require('../src/db');

function cleanupExpiredData(options = {}) {
  const db = getDb();
  const dryRun = options.dryRun || process.argv.includes('--dry-run');
  const jobRetentionDays = options.jobRetentionDays || config.JOB_RETENTION_DAYS;
  const feedbackRetentionDays = options.feedbackRetentionDays || config.FEEDBACK_RETENTION_DAYS;

  console.log(`[Cleanup] Bắt đầu dọn dẹp dữ liệu hết hạn (dryRun=${dryRun}):`);
  console.log(`  - TTL Jobs: ${jobRetentionDays} ngày`);
  console.log(`  - TTL Feedback: ${feedbackRetentionDays} ngày`);

  // 1. Identify expired feedback
  const expiredFeedback = db.prepare(`
    SELECT id, generation_id, created_at
    FROM feedback
    WHERE created_at < datetime('now', ?)
  `).all(`-${feedbackRetentionDays} days`);

  // 2. Identify expired generations
  // SAFE RETENTION: Generations with feedback that is NOT yet expired MUST BE PRESERVED!
  const candidateGenerations = db.prepare(`
    SELECT g.id, g.created_at
    FROM generations g
    WHERE g.created_at < datetime('now', ?)
      AND NOT EXISTS (
        SELECT 1 FROM feedback f 
        WHERE f.generation_id = g.id 
          AND f.created_at >= datetime('now', ?)
      )
  `).all(`-${jobRetentionDays} days`, `-${feedbackRetentionDays} days`);

  // 3. Identify expired jobs
  const expiredJobs = db.prepare(`
    SELECT id, state, created_at
    FROM jobs
    WHERE (state IN ('succeeded', 'failed') AND expires_at < datetime('now'))
       OR (created_at < datetime('now', ?))
  `).all(`-${jobRetentionDays} days`);

  console.log(`[Tìm thấy]:`);
  console.log(`  - ${expiredJobs.length} jobs hết hạn`);
  console.log(`  - ${candidateGenerations.length} generations hết hạn (không còn feedback bảo lưu)`);
  console.log(`  - ${expiredFeedback.length} feedback đã qua 90 ngày`);

  if (dryRun) {
    console.log('[Dry-run] Chế độ chạy thử: Không có dữ liệu nào bị xóa trên đĩa.');
    return {
      dryRun: true,
      jobs_count: expiredJobs.length,
      generations_count: candidateGenerations.length,
      feedback_count: expiredFeedback.length
    };
  }

  // Execute deletion in transaction
  db.exec('BEGIN TRANSACTION;');
  try {
    const delFbStmt = db.prepare('DELETE FROM feedback WHERE id = ?');
    for (const f of expiredFeedback) {
      delFbStmt.run(f.id);
    }

    const delGenStmt = db.prepare('DELETE FROM generations WHERE id = ?');
    for (const g of candidateGenerations) {
      delGenStmt.run(g.id);
    }

    const delJobStmt = db.prepare('DELETE FROM jobs WHERE id = ?');
    for (const j of expiredJobs) {
      delJobStmt.run(j.id);
    }

    db.exec('COMMIT;');

    console.log('✓ Dọn dẹp hoàn tất thành công!');
    return {
      dryRun: false,
      deleted_jobs: expiredJobs.length,
      deleted_generations: candidateGenerations.length,
      deleted_feedback: expiredFeedback.length
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

if (require.main === module) {
  try {
    cleanupExpiredData();
  } catch (err) {
    console.error('[Cleanup Thất Bại]:', err.message);
    process.exit(1);
  }
}

module.exports = { cleanupExpiredData };
