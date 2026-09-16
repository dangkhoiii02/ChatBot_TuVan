const test = require('node:test');
const assert = require('node:assert');
const { createDatabaseConnection } = require('../../src/db');
const { runMigrations } = require('../../src/db/migrate');
const { createHttpServer } = require('../../src/api/server');
const { simulateRequest } = require('../helpers/http_simulator');

test('API Security: Retired endpoints are completely blocked with 410 Gone', async () => {
  const db = createDatabaseConnection(':memory:');
  runMigrations(db);
  const server = createHttpServer(db);

  const endpoints = [
    { path: '/api/documents', method: 'GET' },
    { path: '/api/documents', method: 'POST' },
    { path: '/api/history', method: 'GET' },
    { path: '/api/history', method: 'POST' },
    { path: '/api/samples', method: 'GET' },
    { path: '/api/generate', method: 'POST' }
  ];

  for (const ep of endpoints) {
    const res = await simulateRequest(server, { path: ep.path, method: ep.method });
    assert.strictEqual(res.statusCode, 410, `Endpoint ${ep.method} ${ep.path} phải trả 410 Gone`);
    assert.strictEqual(res.json?.error?.code, 'ENDPOINT_RETIRED');
  }
});

test('API Security: Large payload (>1MB) is rejected with 413 Payload Too Large', async () => {
  const db = createDatabaseConnection(':memory:');
  runMigrations(db);
  const server = createHttpServer(db);

  const largeString = 'A'.repeat(1.5 * 1024 * 1024); // 1.5MB
  const res = await simulateRequest(server, {
    path: '/api/v1/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Job-Token': 'tok123'
    },
    body: JSON.stringify({ message: largeString })
  });

  assert.strictEqual(res.statusCode, 413);
  assert.strictEqual(res.json?.error?.message.includes('vượt quá giới hạn'), true);
});

test('API Security: Health endpoints reflect process and knowledge readiness', async () => {
  const db = createDatabaseConnection(':memory:');
  runMigrations(db);
  const server = createHttpServer(db);

  // 1. Live is always 200
  const liveRes = await simulateRequest(server, { path: '/api/v1/health/live', method: 'GET' });
  assert.strictEqual(liveRes.statusCode, 200);
  assert.strictEqual(liveRes.json?.status, 'ok');

  // 2. Ready is 503 before any active version is published
  const readyRes1 = await simulateRequest(server, { path: '/api/v1/health/ready', method: 'GET' });
  assert.strictEqual(readyRes1.statusCode, 503);

  // 3. Publish active version
  db.prepare(`
    INSERT INTO knowledge_versions (id, status, checksum, created_at)
    VALUES ('v-init', 'published', 'chk', datetime('now'))
  `).run();
  db.prepare(`UPDATE knowledge_state SET active_version_id = 'v-init' WHERE id = 1`).run();

  // 4. Ready is now 200
  const readyRes2 = await simulateRequest(server, { path: '/api/v1/health/ready', method: 'GET' });
  assert.strictEqual(readyRes2.statusCode, 200);
  assert.strictEqual(readyRes2.json?.status, 'ready');
  assert.strictEqual(readyRes2.json?.active_version_id, 'v-init');
});
