const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { importKnowledgeBatch } = require('../../src/knowledge/importer');
const { publishVersion, rollbackVersion } = require('../../src/knowledge/publisher');
const { getKnowledgeContext } = require('../../src/knowledge/retriever');

function setupTestDb() {
  const db = createDatabaseConnection(':memory:');
  runMigrations(db);
  return db;
}

function createBatchFolder(manifest, files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch_test_'));
  fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tmpDir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8');
  }
  return tmpDir;
}

test('Import & Publish: Broken reference after delete is rejected without affecting active version', () => {
  const db = setupTestDb();
  const now = '2026-09-16T10:00:00Z';

  // 1. Initial valid batch with 1 policy and 1 FAQ pointing to it
  const dir1 = createBatchFolder(
    { schema_version: '1.0', batch_id: 'batch-init', submitted_at: now, mode: 'full', files: ['policies.jsonl', 'faq.jsonl'], deleted_item_ids: [] },
    {
      'policies.jsonl': JSON.stringify({
        id: 'policy-test-01', source_ref: 'ref', collected_at: now, permission_status: 'confirmed',
        anonymized: true, review_status: 'approved', approved_by: 'tester', approved_at: now,
        title: 'Pol 1', policy_key: 'pol_1', rule_text: 'Rule text'
      }),
      'faq.jsonl': JSON.stringify({
        id: 'faq-01', source_ref: 'ref', collected_at: now, permission_status: 'confirmed',
        anonymized: true, review_status: 'approved', approved_by: 'tester', approved_at: now,
        question: 'Q?', answer: 'A', policy_ids: ['policy-test-01']
      })
    }
  );

  const res1 = importKnowledgeBatch(db, dir1);
  assert.strictEqual(res1.success, true);
  publishVersion(db, res1.candidate_version_id, { approvedBy: 'tester' });

  const activeBefore = db.prepare('SELECT active_version_id FROM knowledge_state WHERE id = 1').get().active_version_id;
  assert.strictEqual(activeBefore, res1.candidate_version_id);

  // 2. Delta batch that DELETES policy-test-01 while faq-01 still references it!
  const dir2 = createBatchFolder(
    { schema_version: '1.0', batch_id: 'batch-delta-delete', submitted_at: now, mode: 'delta', files: [], deleted_item_ids: [{ id: 'policy-test-01', reason: 'hết hạn' }] },
    {}
  );

  const res2 = importKnowledgeBatch(db, dir2);
  assert.strictEqual(res2.success, false);
  const refErr = res2.errors.find(e => e.field === 'policy_ids');
  assert.ok(refErr, 'Phải bắt lỗi tham chiếu bị hỏng tới policy đã xóa');

  // Active version must NOT have changed!
  const activeAfter = db.prepare('SELECT active_version_id FROM knowledge_state WHERE id = 1').get().active_version_id;
  assert.strictEqual(activeAfter, activeBefore);

  fs.rmSync(dir1, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('Import: Idempotent re-import and conflict on different content with same batch_id', () => {
  const db = setupTestDb();
  const now = '2026-09-16T10:00:00Z';

  const dir = createBatchFolder(
    { schema_version: '1.0', batch_id: 'batch-idemp', submitted_at: now, mode: 'full', files: ['policies.jsonl'], deleted_item_ids: [] },
    {
      'policies.jsonl': JSON.stringify({
        id: 'policy-p1', source_ref: 'ref', collected_at: now, permission_status: 'confirmed',
        anonymized: true, review_status: 'approved', approved_by: 'tester', approved_at: now,
        title: 'Pol 1', policy_key: 'pol_1', rule_text: 'Rule 1'
      })
    }
  );

  // First import
  const res1 = importKnowledgeBatch(db, dir);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.idempotent, undefined);

  // Re-import with same content
  const res2 = importKnowledgeBatch(db, dir);
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.idempotent, true);

  // Modify content and attempt re-import with SAME batch_id -> must throw conflict
  fs.writeFileSync(path.join(dir, 'policies.jsonl'), JSON.stringify({
    id: 'policy-p1', source_ref: 'ref', collected_at: now, permission_status: 'confirmed',
    anonymized: true, review_status: 'approved', approved_by: 'tester', approved_at: now,
    title: 'Pol 1 modified', policy_key: 'pol_1', rule_text: 'Rule 1 modified'
  }));

  assert.throws(() => {
    importKnowledgeBatch(db, dir);
  }, /Xung đột batch_id/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Version Pinning: Concurrency compare-and-swap and rollback', () => {
  const db = setupTestDb();
  const now = '2026-09-16T10:00:00Z';

  // Create v1
  const dir1 = createBatchFolder(
    { schema_version: '1.0', batch_id: 'b-v1', submitted_at: now, mode: 'full', files: ['persona.md'], deleted_item_ids: [] },
    { 'persona.md': '# Persona V1' }
  );
  const r1 = importKnowledgeBatch(db, dir1);
  publishVersion(db, r1.candidate_version_id, { approvedBy: 'tester', expectedRevision: 1 });

  // Create v2
  const dir2 = createBatchFolder(
    { schema_version: '1.0', batch_id: 'b-v2', submitted_at: now, mode: 'full', files: ['persona.md'], deleted_item_ids: [] },
    { 'persona.md': '# Persona V2' }
  );
  const r2 = importKnowledgeBatch(db, dir2);

  // Attempt concurrent publish with stale expectedRevision 1 (now revision is 2)
  assert.throws(() => {
    publishVersion(db, r2.candidate_version_id, { approvedBy: 'tester', expectedRevision: 1 });
  }, /Xung đột phiên bản/);

  // Publish with correct expectedRevision 2
  const pubV2 = publishVersion(db, r2.candidate_version_id, { approvedBy: 'tester', expectedRevision: 2 });
  assert.strictEqual(pubV2.revision, 3);
  assert.strictEqual(pubV2.active_version_id, r2.candidate_version_id);

  // Verify V1 context is still V1
  const ctxV1 = getKnowledgeContext(db, r1.candidate_version_id, 'test');
  assert.strictEqual(ctxV1.persona, '# Persona V1');

  // Verify V2 context is V2
  const ctxV2 = getKnowledgeContext(db, r2.candidate_version_id, 'test');
  assert.strictEqual(ctxV2.persona, '# Persona V2');

  // Rollback to V1
  const rb = rollbackVersion(db, r1.candidate_version_id, { approvedBy: 'tester', expectedRevision: 3 });
  assert.strictEqual(rb.active_version_id, r1.candidate_version_id);
  assert.strictEqual(rb.revision, 4);

  fs.rmSync(dir1, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
});
