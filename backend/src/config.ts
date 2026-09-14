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
  PANCAKE_ACCESS_TOKEN: z.string().optional().default(''),
  PANCAKE_PAGE_ACCESS_TOKEN: z.string().optional().default(''),
  PANCAKE_CONVERSATION_LIMIT: z.coerce.number().int().positive().max(50).default(30),
  PANCAKE_MESSAGE_LIMIT: z.coerce.number().int().positive().max(50).default(30),
  AI_PROVIDER: z.enum(['mock', 'claude', 'gemini']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional().default('gemini-3.6-flash'),
  AI_KNOWLEDGE_DIR: z.string().default('../data'),
  DEMO_REPLY_STORE_PATH: z.string().default('./data/demo_replies.jsonl')
});

const env = envSchema.parse(process.env);

function resolveBackendPath(input: string) {
  if (path.isAbsolute(input)) return input;
  return path.resolve(backendRoot, input);
}

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  pancake: {
    baseUrl: env.PANCAKE_BASE_URL.replace(/\/$/, ''),
    pageId: env.PANCAKE_PAGE_ID,
    accessToken: env.PANCAKE_ACCESS_TOKEN,
    pageAccessToken: env.PANCAKE_PAGE_ACCESS_TOKEN,
    conversationLimit: env.PANCAKE_CONVERSATION_LIMIT,
    messageLimit: env.PANCAKE_MESSAGE_LIMIT
  },
  ai: {
    provider: env.AI_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || 'gemini-3.6-flash',
    knowledgeDir: resolveBackendPath(env.AI_KNOWLEDGE_DIR || '../data')
  },
  demoReplyStorePath: resolveBackendPath(env.DEMO_REPLY_STORE_PATH)
};

export function isPancakeConfigured() {
  return Boolean(config.pancake.pageAccessToken || config.pancake.accessToken);
}

export function getPancakeAuthMode() {
  if (config.pancake.pageAccessToken) return 'page_access_token';
  if (config.pancake.accessToken) return 'access_token';
  return 'missing';
}
