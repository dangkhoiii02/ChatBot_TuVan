import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const backendRoot = path.resolve(currentDir, '..');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PANCAKE_BASE_URL: z.string().url().default('https://pages.fm/api'),
  PANCAKE_PAGE_ID: z.string().optional().default(''),
  PANCAKE_PAGE_ACCESS_TOKEN: z.string().optional().default(''),
  /** Optional CSV fallback allowlist — only used when ENABLE_ENV_ACTIVE_USER_FALLBACK=1 */
  PANCAKE_ACTIVE_USER_IDS: z.string().optional().default(''),
  ENABLE_ENV_ACTIVE_USER_FALLBACK: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .default('0'),
  /** When 1, staff APIs also accept phase-1 X-User-Id against env CSV (dev only). */
  ALLOW_DEV_USER_HEADER: z.enum(['0', '1', 'true', 'false']).optional().default('0'),
  APP_SESSION_SECRET: z.string().optional().default(''),
  APP_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 12),
  PANCAKE_CONVERSATION_LIMIT: z.coerce.number().int().positive().max(50).default(30),
  PANCAKE_MESSAGE_LIMIT: z.coerce.number().int().positive().max(50).default(30),
  AI_PROVIDER: z.enum(['auto', 'mock', 'claude', 'anthropic', 'gemini', 'openai', 'deepseek', 'groq', 'openrouter', 'mistral', 'xai', 'custom']).default('auto'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional().default(''),
  AI_KNOWLEDGE_DIR: z.string().default('../data'),
  DEMO_REPLY_STORE_PATH: z.string().default('./data/demo_replies.jsonl')
});

const env = envSchema.parse(process.env);

function resolveBackendPath(input: string) {
  if (path.isAbsolute(input)) return input;
  return path.resolve(backendRoot, input);
}

function parseCsvIds(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function truthyFlag(value: string) {
  return value === '1' || value === 'true';
}

const envActiveUserIds = parseCsvIds(env.PANCAKE_ACTIVE_USER_IDS);

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  pancake: {
    baseUrl: env.PANCAKE_BASE_URL.replace(/\/$/, ''),
    pageId: env.PANCAKE_PAGE_ID,
    pageAccessToken: env.PANCAKE_PAGE_ACCESS_TOKEN,
    conversationLimit: env.PANCAKE_CONVERSATION_LIMIT,
    messageLimit: env.PANCAKE_MESSAGE_LIMIT
  },
  auth: {
    sessionSecret:
      env.APP_SESSION_SECRET ||
      (env.NODE_ENV === 'development' ? 'dev-app-session-secret-change-me' : ''),
    sessionTtlSeconds: env.APP_SESSION_TTL_SECONDS,
    envActiveUserIds,
    enableEnvActiveUserFallback: truthyFlag(env.ENABLE_ENV_ACTIVE_USER_FALLBACK),
    allowDevUserHeader: truthyFlag(env.ALLOW_DEV_USER_HEADER)
  },
  ai: {
    provider: env.AI_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || '',
    knowledgeDir: resolveBackendPath(env.AI_KNOWLEDGE_DIR || '../data')
  },
  demoReplyStorePath: resolveBackendPath(env.DEMO_REPLY_STORE_PATH)
};

export function isPancakeConfigured() {
  return Boolean(config.pancake.pageAccessToken && config.pancake.pageId);
}

export function getPancakeAuthMode() {
  if (config.pancake.pageAccessToken) return 'page_access_token';
  return 'missing';
}

export function assertSessionSecretConfigured() {
  if (!config.auth.sessionSecret) {
    throw new Error('Missing APP_SESSION_SECRET');
  }
}
