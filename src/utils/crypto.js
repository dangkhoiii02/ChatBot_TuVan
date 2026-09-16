const crypto = require('node:crypto');

function sha256(content) {
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  return crypto.createHash('sha256').update(str).digest('hex');
}

function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashJobToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token phải là chuỗi ký tự hợp lệ.');
  }
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function verifyJobToken(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const computedHash = hashJobToken(token);
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedHash, 'utf-8'),
    Buffer.from(expectedHash, 'utf-8')
  );
}

module.exports = {
  sha256,
  generateSecureToken,
  hashJobToken,
  verifyJobToken
};
