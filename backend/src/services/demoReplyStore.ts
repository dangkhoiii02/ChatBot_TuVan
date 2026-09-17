import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { DemoReply } from '../types/api.js';
import { getDatabase } from '../db/index.js';

type SaveDemoReplyInput = {
  conversationId: string;
  content: string;
  sourceSuggestionId?: string;
};

export async function getDemoReplies(conversationId?: string): Promise<DemoReply[]> {
  try {
    const db = getDatabase();
    let rows: Array<{
      id: string;
      conversation_id: string;
      content: string;
      source_suggestion_id: string | null;
      created_at: string;
    }>;

    if (conversationId) {
      rows = db.prepare(`
        SELECT id, conversation_id, content, source_suggestion_id, created_at
        FROM demo_replies
        WHERE conversation_id = ?
        ORDER BY created_at DESC
      `).all(conversationId) as typeof rows;
    } else {
      rows = db.prepare(`
        SELECT id, conversation_id, content, source_suggestion_id, created_at
        FROM demo_replies
        ORDER BY created_at DESC
      `).all() as typeof rows;
    }

    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        content: r.content,
        sourceSuggestionId: r.source_suggestion_id || undefined,
        createdAt: r.created_at
      }));
    }
  } catch (err) {
    console.warn('Could not read demo replies from database, trying file store:', err);
  }

  // Fallback to JSONL
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
  const item: DemoReply = {
    id: `reply-${Date.now()}`,
    conversationId: input.conversationId,
    content: input.content,
    sourceSuggestionId: input.sourceSuggestionId,
    createdAt: new Date().toISOString()
  };

  try {
    const db = getDatabase();
    // 1. Insert into demo_replies
    db.prepare(`
      INSERT INTO demo_replies (id, conversation_id, content, source_suggestion_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(item.id, item.conversationId, item.content, item.sourceSuggestionId || null, item.createdAt);

    // 2. Insert into messages as staff message
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender, sender_name, text, attachments_json, created_at)
      VALUES (?, ?, 'staff', 'Thầy Minh', ?, '[]', ?)
    `).run(`msg-${Date.now()}`, item.conversationId, item.content, item.createdAt);

    // 3. Update conversation last_message and updated_at
    db.prepare(`
      UPDATE conversations
      SET last_message = ?, updated_at = ?
      WHERE id = ?
    `).run(item.content, item.createdAt, item.conversationId);
  } catch (err) {
    console.warn('Could not persist reply into SQLite database:', err);
  }

  // Also sync to JSONL
  try {
    await ensureStore();
    await fs.appendFile(config.demoReplyStorePath, `${JSON.stringify(item)}\n`, 'utf-8');
  } catch (err) {
    console.warn('Could not append reply to JSONL store:', err);
  }

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
