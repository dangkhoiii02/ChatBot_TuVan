import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { DemoReply } from '../types/api.js';

type SaveDemoReplyInput = {
  conversationId: string;
  content: string;
  sourceSuggestionId?: string;
};

export async function getDemoReplies(conversationId?: string): Promise<DemoReply[]> {
  await ensureStore();
  const raw = await fs.readFile(config.demoReplyStorePath, 'utf-8');
  const items = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter((item): item is DemoReply => Boolean(item));

  if (!conversationId) return items.reverse();
  return items.filter((item) => item.conversationId === conversationId).reverse();
}

export async function saveDemoReply(input: SaveDemoReplyInput): Promise<DemoReply> {
  await ensureStore();
  const item: DemoReply = {
    id: `reply-${Date.now()}`,
    conversationId: input.conversationId,
    content: input.content,
    sourceSuggestionId: input.sourceSuggestionId,
    createdAt: new Date().toISOString()
  };

  await fs.appendFile(config.demoReplyStorePath, `${JSON.stringify(item)}\n`, 'utf-8');
  return item;
}

async function ensureStore() {
  await fs.mkdir(path.dirname(config.demoReplyStorePath), { recursive: true });

  try {
    await fs.access(config.demoReplyStorePath);
  } catch {
    await fs.writeFile(config.demoReplyStorePath, '', 'utf-8');
  }
}

function parseLine(line: string): DemoReply | null {
  try {
    return JSON.parse(line) as DemoReply;
  } catch {
    return null;
  }
}
