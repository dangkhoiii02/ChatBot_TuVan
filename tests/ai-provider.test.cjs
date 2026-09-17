const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAI, requestAI } = require('../shared/ai-provider.cjs');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const result = { intent: 'check_in', sensitivity: 'xanh', replies: [{ tone: 'A', content: 'Hello' }] };

for (const [provider, key, model] of [
  ['gemini', 'AIza-test', 'gemini-custom'], ['anthropic', 'sk-ant-test', 'claude-custom'],
  ['groq', 'gsk_test', 'llama-custom'], ['openrouter', 'sk-or-test', 'vendor/model'],
  ['openai', 'sk-test', 'gpt-custom'], ['deepseek', 'sk-test', 'deepseek-chat'], ['xai', 'xai-test', 'grok-custom'],
]) test(`auto selects ${provider} without probing`, () => {
  const settings = resolveAI({ apiKey: key, model }, {});
  assert.equal(settings.provider, provider);
  assert.equal(settings.model, model);
});

test('ambiguous keys require explicit provider', () => {
  assert.throws(() => resolveAI({ apiKey: 'sk-unknown', model: 'llama' }, {}), /nhà cung cấp/);
  assert.equal(resolveAI({ provider: 'mistral', apiKey: 'unknown', model: 'my-model' }, {}).provider, 'mistral');
});
test('user credentials never borrow server model or key', () => {
  assert.throws(() => resolveAI({ provider: 'openai', model: 'gpt-test' }, { AI_API_KEY: 'server-secret' }), /API key/);
  assert.throws(() => resolveAI({ provider: 'openai', apiKey: 'user-key' }, { AI_MODEL: 'gpt-server' }), /model/);
});
test('server configuration and legacy Gemini environment remain supported', () => {
  assert.equal(resolveAI({}, { AI_PROVIDER: 'openai', AI_API_KEY: 'server', AI_MODEL: 'gpt-test' }).provider, 'openai');
  assert.equal(resolveAI({}, { GEMINI_API_KEY: 'AIza-test', GEMINI_MODEL: 'gemini-test' }).provider, 'gemini');
});
test('empty config is mock; explicit user config overrides server mock', () => {
  assert.equal(resolveAI({}, {}).provider, 'mock');
  assert.equal(resolveAI({ apiKey: 'sk-ant-test', model: 'claude-test' }, { AI_PROVIDER: 'mock' }).provider, 'anthropic');
});
test('custom URLs require exact admin allowlist; credentials/query/http blocked', () => {
  const input = { provider: 'custom', apiKey: 'key', model: 'anything', baseUrl: 'https://gateway.example/v1' };
  assert.throws(() => resolveAI(input, {}), /AI_ALLOWED_BASE_URLS/);
  assert.equal(resolveAI(input, { AI_ALLOWED_BASE_URLS: input.baseUrl }).baseUrl, input.baseUrl);
  for (const baseUrl of ['http://127.0.0.1', 'https://user:pass@example.org', 'https://example.org/?key=secret']) {
    assert.throws(() => resolveAI({ ...input, baseUrl }, { AI_ALLOWED_BASE_URLS: baseUrl }));
  }
});
for (const provider of ['gemini', 'anthropic', 'openai', 'deepseek', 'groq', 'openrouter', 'mistral', 'xai', 'custom']) {
  test(`${provider} sends correct protocol and parses response`, async () => {
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      assert.ok(!url.includes('secret'));
      if (provider === 'gemini') {
        assert.equal(options.headers['x-goog-api-key'], 'secret');
        assert.equal(body.contents[0].parts[0].text, 'prompt');
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
      }
      assert.equal(body.model, 'test/model');
      if (provider === 'anthropic') {
        assert.equal(options.headers['x-api-key'], 'secret');
        assert.ok(body.max_tokens);
        return Response.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
      }
      assert.equal(options.headers.Authorization, 'Bearer secret');
      assert.ok(url.endsWith('/chat/completions'));
      return Response.json({ choices: [{ message: { content: '```json\n' + JSON.stringify(result) + '\n```' } }] });
    };
    assert.deepEqual(await requestAI({ provider, apiKey: 'secret', model: 'test/model', baseUrl: provider === 'custom' ? 'https://gateway.example/v1' : '' }, 'system', 'prompt'), result);
  });
}
test('API errors do not expose upstream secret or retry another provider', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return new Response('secret', { status: 401 }); };
  await assert.rejects(requestAI({ provider: 'openai', apiKey: 'secret', model: 'm' }, '', ''), error => error.message.includes('401') && !error.message.includes('secret'));
  assert.equal(calls, 1);
});
test('invalid, empty and missing replies responses are rejected', async () => {
  for (const content of ['', 'not json', 'null', '{}', '{"replies":[]}']) {
    global.fetch = async () => Response.json({ choices: [{ message: { content } }] });
    await assert.rejects(requestAI({ provider: 'openai', apiKey: 'key', model: 'm' }, '', ''));
  }
});
test('empty browser defaults do not suppress configured server AI', () => {
  const settings = resolveAI({ provider: 'auto', apiKey: '', model: '' }, { AI_PROVIDER: 'openai', AI_API_KEY: 'server', AI_MODEL: 'gpt-test' });
  assert.equal(settings.provider, 'openai');
  assert.equal(settings.apiKey, 'server');
});
