import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export type RedFlagsConfig = {
  categories?: Record<
    string,
    {
      name?: string;
      keywords?: string[];
      instruction?: string;
    }
  >;
};

export type AiKnowledgeBase = {
  persona: string;
  policy: string;
  redFlagsRaw: string;
  redFlags: RedFlagsConfig;
};

let cachedKnowledgeBase: Promise<AiKnowledgeBase> | null = null;

export async function loadAiKnowledgeBase() {
  cachedKnowledgeBase ??= readAiKnowledgeBase();
  return cachedKnowledgeBase;
}

export function normalizeVietnamese(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

async function readAiKnowledgeBase(): Promise<AiKnowledgeBase> {
  const [persona, policy, redFlagsRaw] = await Promise.all([
    readKnowledgeFile('persona.md'),
    readKnowledgeFile('policy.md'),
    readKnowledgeFile('red_flags.json')
  ]);

  return {
    persona,
    policy,
    redFlagsRaw,
    redFlags: parseJson<RedFlagsConfig>(redFlagsRaw, { categories: {} })
  };
}

async function readKnowledgeFile(filename: string) {
  try {
    return await fs.readFile(path.join(config.ai.knowledgeDir, filename), 'utf8');
  } catch {
    return '';
  }
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    if (!text.trim()) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
