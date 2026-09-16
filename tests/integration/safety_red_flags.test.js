const test = require('node:test');
const assert = require('node:assert');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { checkRedFlags, getRelevantFewShots } = require('../../src/knowledge/retriever');
const { generateMockReply } = require('../../src/providers/mock');

function setupKnowledgeDb() {
  const db = createDatabaseConnection(':memory:');
  runMigrations(db);

  const verId = 'ver_safety_01';
  db.prepare(`
    INSERT INTO knowledge_versions (id, parent_id, status, checksum, approved_by_label, approved_at, published_at, created_at)
    VALUES (?, NULL, 'published', 'chk', 'admin', datetime('now'), datetime('now'), datetime('now'))
  `).run(verId);

  // Safety rule
  db.prepare(`
    INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
    VALUES (?, 'safety-cancer-01', 'safety_rule', ?, 'src', 'hash')
  `).run(verId, JSON.stringify({
    category: 'Bệnh hiểm nghèo',
    keywords: ['ung thư', 'xạ trị', 'hóa trị'],
    instruction: 'Tuyệt đối không níu kéo. Đồng cảm, an ủi, hỗ trợ hoàn tiền.',
    safe_reply_template: 'Thầy chúc em bình an và an tâm chữa bệnh, chuyện học gác lại em nhé!',
    requires_human_review: true
  }));

  // Train conversation
  db.prepare(`
    INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
    VALUES (?, 'conv-train-01', 'conversation', ?, 'src', 'hash')
  `).run(verId, JSON.stringify({
    split: 'train',
    sensitivity: 'xanh',
    messages: [{ role: 'student', text: 'Tập đàn 15 phút mỗi ngày vui quá thầy!' }],
    approved_reply: 'Giỏi lắm nè, duy trì đều đặn nhen em!'
  }));

  // EVAL conversation (MUST NEVER BE RETRIEVED!)
  db.prepare(`
    INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
    VALUES (?, 'conv-eval-secret-01', 'conversation', ?, 'src', 'hash')
  `).run(verId, JSON.stringify({
    split: 'eval',
    sensitivity: 'do',
    messages: [{ role: 'student', text: 'Đây là câu hỏi đánh giá benchmark bảo mật bí mật' }],
    approved_reply: 'SECRET_EVAL_ANSWER'
  }));

  return { db, verId };
}

test('Safety: Red flags detect critical condition and provide safe reply template', () => {
  const { db, verId } = setupKnowledgeDb();

  const res = checkRedFlags(db, verId, 'Dạ em bị phát hiện khối u ung thư đang phải xạ trị...');
  assert.strictEqual(res.isRed, true);
  assert.strictEqual(res.category, 'Bệnh hiểm nghèo');
  assert.ok(res.safeReplyTemplate.includes('an tâm chữa bệnh'));
  assert.ok(res.reason.includes('Tuyệt đối không níu kéo'));
});

test('Safety: Provider returns single compassionate response for red flag and does not force 5 replies', async () => {
  const { db, verId } = setupKnowledgeDb();
  const redFlagCheck = checkRedFlags(db, verId, 'Em phải nằm viện xạ trị ung thư');

  const output = await generateMockReply({
    message: 'Em phải nằm viện xạ trị ung thư',
    knowledge: { redFlagCheck }
  });

  assert.strictEqual(output.sensitivity, 'do');
  assert.strictEqual(output.replies.length, 1);
  assert.ok(output.replies[0].content.includes('chữa bệnh'));
});

test('Safety: Conversations with split=eval are strictly excluded from retrieval context', () => {
  const { db, verId } = setupKnowledgeDb();

  const retrieved = getRelevantFewShots(db, verId, { text: 'bảo mật bí mật', limit: 10 });
  const hasEval = retrieved.some(c => c.split === 'eval' || (c.approved_reply && c.approved_reply.includes('SECRET_EVAL')));
  assert.strictEqual(hasEval, false, 'Bộ eval không bao giờ được xuất hiện trong ngữ cảnh few-shots');
});
