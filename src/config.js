const fs = require('node:fs');
const path = require('node:path');

// Simple zero-dependency .env file parser
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

// Auto-load .env in project root if exists
loadEnvFile(path.join(process.cwd(), '.env'));

function getEnv(key, defaultValue = '') {
  return process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : defaultValue;
}

function getEnvInt(key, defaultValue) {
  const raw = getEnv(key, '');
  if (raw === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Cấu hình '${key}' phải là một số nguyên hợp lệ. Giá trị hiện tại: '${raw}'`);
  }
  return parsed;
}

const config = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  HOST: getEnv('HOST', '127.0.0.1'),
  PORT: getEnvInt('PORT', 3000),
  DATABASE_PATH: getEnv('DATABASE_PATH', path.join(process.cwd(), 'storage', 'app.db')),
  
  // AI Provider config
  PROVIDER: getEnv('PROVIDER', 'mock'), // 'gemini' | 'mock'
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY', ''),
  GEMINI_MODEL: getEnv('GEMINI_MODEL', 'gemini-2.5-flash'),

  // Queue and limits
  CONCURRENCY_LIMIT: getEnvInt('CONCURRENCY_LIMIT', 3),
  QUEUE_LIMIT: getEnvInt('QUEUE_LIMIT', 50),
  CALL_TIMEOUT_MS: getEnvInt('CALL_TIMEOUT_MS', 30000),
  MAX_JOB_DEADLINE_MS: getEnvInt('MAX_JOB_DEADLINE_MS', 120000),
  MAX_RETRY_ATTEMPTS: getEnvInt('MAX_RETRY_ATTEMPTS', 2),

  // Security & origins
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS', 'http://127.0.0.1:3000,http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
  MAX_REQUEST_BODY_BYTES: getEnvInt('MAX_REQUEST_BODY_BYTES', 1048576), // 1MB

  // Retention TTL
  JOB_RETENTION_DAYS: getEnvInt('JOB_RETENTION_DAYS', 7),
  FEEDBACK_RETENTION_DAYS: getEnvInt('FEEDBACK_RETENTION_DAYS', 90)
};

// Validate config invariants
function validateConfig() {
  const errors = [];
  if (config.PORT <= 0 || config.PORT > 65535) {
    errors.push(`PORT không hợp lệ: ${config.PORT}. Cần nằm trong khoảng 1-65535.`);
  }

  if (config.CONCURRENCY_LIMIT < 1) {
    errors.push(`CONCURRENCY_LIMIT phải >= 1. Hiện tại: ${config.CONCURRENCY_LIMIT}`);
  }

  if (config.QUEUE_LIMIT < 1) {
    errors.push(`QUEUE_LIMIT phải >= 1. Hiện tại: ${config.QUEUE_LIMIT}`);
  }

  if (config.CALL_TIMEOUT_MS < 1000) {
    errors.push(`CALL_TIMEOUT_MS phải >= 1000ms. Hiện tại: ${config.CALL_TIMEOUT_MS}`);
  }

  if (config.MAX_JOB_DEADLINE_MS < config.CALL_TIMEOUT_MS) {
    errors.push(`MAX_JOB_DEADLINE_MS (${config.MAX_JOB_DEADLINE_MS}ms) phải >= CALL_TIMEOUT_MS (${config.CALL_TIMEOUT_MS}ms).`);
  }

  if (config.PROVIDER === 'gemini' && !config.GEMINI_API_KEY && config.NODE_ENV === 'production') {
    errors.push(`PROVIDER='gemini' yêu cầu biến môi trường GEMINI_API_KEY trong môi trường production.`);
  }

  if (errors.length > 0) {
    throw new Error(`Lỗi cấu hình hệ thống:\n - ${errors.join('\n - ')}`);
  }
}

validateConfig();

module.exports = config;
