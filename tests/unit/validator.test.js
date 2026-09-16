const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { validateBatchDirectory } = require('../../src/knowledge/validator');

function createTempBatchDir(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb_test_'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tmpDir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8');
  }
  return tmpDir;
}

test('Validator: Path traversal in manifest files array is rejected', () => {
  const dir = createTempBatchDir({
    'manifest.json': {
      schema_version: '1.0',
      batch_id: 'b-traversal',
      submitted_at: '2026-09-16T10:00:00Z',
      mode: 'delta',
      files: ['../secret.txt']
    }
  });

  const res = validateBatchDirectory(dir);
  assert.strictEqual(res.valid, false);
  const err = res.errors.find(e => e.field === 'filename');
  assert.ok(err, 'Phải bắt lỗi path traversal trong tên file');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Validator: Malformed JSON syntax in jsonl file is caught with line number', () => {
  const dir = createTempBatchDir({
    'manifest.json': {
      schema_version: '1.0',
      batch_id: 'b-bad-json',
      submitted_at: '2026-09-16T10:00:00Z',
      mode: 'delta',
      files: ['faq.jsonl']
    },
    'faq.jsonl': '{"id":"faq-001"}\n{invalid_json_here}\n'
  });

  const res = validateBatchDirectory(dir);
  assert.strictEqual(res.valid, false);
  const err = res.errors.find(e => e.field === 'json_syntax');
  assert.ok(err);
  assert.strictEqual(err.line, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Validator: Duplicate IDs within same batch are rejected', () => {
  const now = '2026-09-16T10:00:00Z';
  const dir = createTempBatchDir({
    'manifest.json': {
      schema_version: '1.0',
      batch_id: 'b-dup-id',
      submitted_at: now,
      mode: 'delta',
      files: ['policies.jsonl']
    },
    'policies.jsonl': [
      JSON.stringify({
        id: 'policy-001', source_ref: 'ref1', collected_at: now,
        permission_status: 'confirmed', anonymized: true, review_status: 'draft',
        title: 'Title 1', policy_key: 'key1', rule_text: 'Rule 1'
      }),
      JSON.stringify({
        id: 'policy-001', source_ref: 'ref2', collected_at: now,
        permission_status: 'confirmed', anonymized: true, review_status: 'draft',
        title: 'Title 2', policy_key: 'key2', rule_text: 'Rule 2'
      })
    ].join('\n')
  });

  const res = validateBatchDirectory(dir);
  assert.strictEqual(res.valid, false);
  const err = res.errors.find(e => e.field === 'id' && e.message.includes('trùng lặp'));
  assert.ok(err, 'Phải phát hiện ID trùng lặp');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Validator: Overlapping policy effective periods for same key & scope are rejected', () => {
  const now = '2026-09-16T10:00:00Z';
  const dir = createTempBatchDir({
    'manifest.json': {
      schema_version: '1.0',
      batch_id: 'b-overlap',
      submitted_at: now,
      mode: 'delta',
      files: ['policies.jsonl']
    },
    'policies.jsonl': [
      JSON.stringify({
        id: 'policy-p1', source_ref: 'ref1', collected_at: now,
        permission_status: 'confirmed', anonymized: true, review_status: 'draft',
        title: 'P1', policy_key: 'fee', scope: 'standard', rule_text: 'Fee 1',
        effective_from: '2026-01-01T00:00:00Z', effective_to: '2026-06-01T00:00:00Z'
      }),
      JSON.stringify({
        id: 'policy-p2', source_ref: 'ref2', collected_at: now,
        permission_status: 'confirmed', anonymized: true, review_status: 'draft',
        title: 'P2', policy_key: 'fee', scope: 'standard', rule_text: 'Fee 2',
        effective_from: '2026-05-01T00:00:00Z', effective_to: '2026-12-01T00:00:00Z'
      })
    ].join('\n')
  });

  const res = validateBatchDirectory(dir);
  assert.strictEqual(res.valid, false);
  const err = res.errors.find(e => e.field === 'effective_from' && e.message.includes('trùng lặp'));
  assert.ok(err, 'Phải phát hiện khoảng hiệu lực chồng chéo');
  fs.rmSync(dir, { recursive: true, force: true });
});
