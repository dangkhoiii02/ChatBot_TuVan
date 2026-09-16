const test = require('node:test');
const assert = require('node:assert');
const { sha256, generateSecureToken, hashJobToken, verifyJobToken } = require('../../src/utils/crypto');

test('Crypto: sha256 creates deterministic hash', () => {
  const hash1 = sha256('hello world');
  const hash2 = sha256('hello world');
  const hash3 = sha256('hello world 2');

  assert.strictEqual(hash1, hash2);
  assert.notStrictEqual(hash1, hash3);
  assert.strictEqual(hash1.length, 64);
});

test('Crypto: generateSecureToken generates unique random tokens', () => {
  const tok1 = generateSecureToken(32);
  const tok2 = generateSecureToken(32);

  assert.strictEqual(tok1.length, 64);
  assert.notStrictEqual(tok1, tok2);
});

test('Crypto: hashJobToken and verifyJobToken work securely', () => {
  const token = 'secret_token_12345';
  const hash = hashJobToken(token);

  assert.strictEqual(verifyJobToken(token, hash), true);
  assert.strictEqual(verifyJobToken('wrong_token', hash), false);
  assert.strictEqual(verifyJobToken('', hash), false);
  assert.strictEqual(verifyJobToken(token, ''), false);
});
