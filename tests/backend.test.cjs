const { test } = require('node:test');
const assert = require('node:assert/strict');
// Isolate integration checks from local credentials and external services.
process.env.NODE_ENV = 'test';
process.env.APP_SESSION_SECRET = 'test-session-secret';
process.env.AI_PROVIDER = 'mock';
process.env.PANCAKE_PAGE_ID = '';

test('HTTP validation, authorization and legacy-header CORS', async () => {
  const { createApp } = await import('../backend/dist/app.js');
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const unauth = await fetch(base + '/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unauth.status, 401);
    const preflight = await fetch(base + '/api/suggestions', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5180', 'Access-Control-Request-Headers': 'x-gemini-api-key' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /X-Gemini-Api-Key/);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'demo' }) });
    assert.equal(login.status, 200);
    const { sessionToken } = await login.json();
    for (const body of [
      { conversationId: 't', messages: [{ id: 'm', sender: 'student', text: 'hello', createdAt: '2026-01-01' }], apiKey: 'key', model: 'unknown' },
      { conversationId: 't', messages: 'wrong' },
      { conversationId: 't', messages: [{ id: 'm', sender: 'student', text: 'hello', createdAt: '2026-01-01' }], provider: 'custom', apiKey: 'key', model: 'm', baseUrl: 'https://unapproved.example/v1' },
    ]) {
      const response = await fetch(base + '/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` }, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('demo cannot authenticate in production; arbitrary tokens cannot become demo', async () => {
  const { config } = await import('../backend/dist/config.js');
  const { loginWithPancakeUserToken } = await import('../backend/dist/services/pancakeLogin.js');
  const original = config.nodeEnv;
  try {
    config.nodeEnv = 'production';
    await assert.rejects(loginWithPancakeUserToken('demo'), /disabled in production/);
    config.nodeEnv = 'development';
    await assert.rejects(loginWithPancakeUserToken('invalid-token'), /PANCAKE_PAGE_ID/);
  } finally { config.nodeEnv = original; }
});

test('legacy demo uses the shared provider and preserves custom model IDs', async () => {
  const { server } = require('../server.js');
  const originalFetch = global.fetch;
  let upstreamCalls = 0;
  global.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.anthropic.com/')) {
      upstreamCalls++;
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'claude-user-model');
      assert.equal(init.headers['x-api-key'], 'sk-ant-test');
      return Response.json({ content: [{ type: 'text', text: JSON.stringify({ sensitivity: 'xanh', replies: [{ tone: 'A', content: 'Hello' }] }) }] });
    }
    return originalFetch(url, init);
  };
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Em muốn hỏi lịch học', apiKey: 'sk-ant-test', model: 'claude-user-model', provider: 'auto' }),
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.provider, 'anthropic (claude-user-model)');
    assert.equal(upstreamCalls, 1);
  } finally {
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
});
