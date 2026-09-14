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

export type FewShotSample = {
  id?: string;
  title?: string;
  category?: string;
  input_message?: string;
  sensitivity?: 'xanh' | 'vang' | 'do';
  flag_reason?: string;
  model_replies?: Array<string | { tone?: string; content?: string }>;
};

export type AiKnowledgeBase = {
  persona: string;
  policy: string;
  redFlagsRaw: string;
  redFlags: RedFlagsConfig;
  fewShots: FewShotSample[];
};

let cachedKnowledgeBase: Promise<AiKnowledgeBase> | null = null;

export async function loadAiKnowledgeBase() {
  cachedKnowledgeBase ??= readAiKnowledgeBase();
  return cachedKnowledgeBase;
}

export function findMatchingFewShot(samples: FewShotSample[], text: string) {
  const normalizedInput = normalizeVietnamese(text);
  if (!normalizedInput) return undefined;

  return samples.find((sample) => {
    const sampleInput = normalizeVietnamese(sample.input_message || '');
    if (!sampleInput) return false;

    const inputPreview = normalizedInput.slice(0, 30);
    const samplePreview = sampleInput.slice(0, 30);

    return normalizedInput.includes(samplePreview) || sampleInput.includes(inputPreview);
  });
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
  const [persona, policy, redFlagsRaw, fewShotsRaw] = await Promise.all([
    readKnowledgeFile('persona.md'),
    readKnowledgeFile('policy.md'),
    readKnowledgeFile('red_flags.json'),
    readKnowledgeFile('few_shots.json')
  ]);

  return {
    persona,
    policy,
    redFlagsRaw,
    redFlags: parseJson<RedFlagsConfig>(redFlagsRaw, { categories: {} }),
    fewShots: parseJson<FewShotSample[]>(fewShotsRaw, [])
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
