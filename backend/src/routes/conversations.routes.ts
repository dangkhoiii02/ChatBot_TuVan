import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { hasPancakePageAccess, pancakeClient } from '../services/pancakeClient.js';
import { normalizeConversation, normalizeMessage } from '../services/pancakeNormalizer.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { getDatabase } from '../db/index.js';

export const conversationsRouter = Router();

const conversationsQuerySchema = z.object({
  pageIds: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional()
});

const messagesQuerySchema = z.object({
  pageId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  before: z.string().optional()
});

conversationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = conversationsQuerySchema.parse(req.query);
    const limit = query.limit ?? config.pancake.conversationLimit;
    const pageIds = getPageIds(query.pageIds);
    assertPageAccess(req, pageIds);

    // If Pancake is configured and not purely demo-page, query Pancake
    if (pageIds.every((pageId) => hasPancakePageAccess(pageId))) {
      try {
        const results = await Promise.all(
          pageIds.map(async (pageId) => {
            const raw = await pancakeClient.listConversations({
              pageId,
              limit,
              since: query.since,
              until: query.until
            });

            return extractItems(raw).map((item) => normalizeConversation(item, { id: pageId }));
          })
        );
        const items = results
          .flat()
          .sort((left, right) => getTime(right.updatedAt) - getTime(left.updatedAt))
          .slice(0, limit);

        return res.json({ items });
      } catch (err) {
        if (!config.allowDemoMode) {
          throw new HttpError(502, 'Không tải được hội thoại từ Pancake. Vui lòng thử lại.', 'PANCAKE_UNAVAILABLE');
        }
        console.warn('Pancake listConversations failed, demo fallback enabled:', err);
      }
    }

    if (!config.allowDemoMode) {
      throw new HttpError(503, 'Pancake chưa được cấu hình trên máy chủ.', 'PANCAKE_NOT_CONFIGURED');
    }

    // Fallback or demo mode: fetch from SQLite database
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, page_id, page_name, customer_id, customer_name, avatar_url, last_message, updated_at, unread_count
      FROM conversations
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string;
      page_id: string;
      page_name: string | null;
      customer_id: string | null;
      customer_name: string;
      avatar_url: string | null;
      last_message: string;
      updated_at: string;
      unread_count: number;
    }>;

    const items = rows.map((row) => ({
      pageId: row.page_id,
      pageName: row.page_name || 'Lớp Nhạc Thầy Minh',
      id: row.id,
      customerId: row.customer_id || undefined,
      customerName: row.customer_name,
      avatarUrl: row.avatar_url || '',
      lastMessage: row.last_message,
      updatedAt: row.updated_at,
      unreadCount: row.unread_count,
      source: 'pancake' as const
    }));

    res.json({ items });
  })
);

conversationsRouter.get(
  '/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const conversationId = req.params.conversationId;
    if (!conversationId) {
      throw new HttpError(400, 'Missing conversation id');
    }

    const query = messagesQuerySchema.parse(req.query);
    const limit = query.limit ?? config.pancake.messageLimit;
    assertPageAccess(req, [query.pageId || '']);

    // Try Pancake if configured
    if (hasPancakePageAccess(query.pageId)) {
      try {
        const raw = await pancakeClient.listMessages({
          pageId: query.pageId,
          conversationId,
          limit,
          before: query.before
        });

        const items = extractItems(raw)
          .map((item) => normalizeMessage(item, conversationId))
          .sort((a, b) => getTime(a.createdAt) - getTime(b.createdAt));

        return res.json({
          conversationId,
          items
        });
      } catch (err) {
        if (!config.allowDemoMode) {
          throw new HttpError(502, 'Không tải được tin nhắn từ Pancake. Vui lòng thử lại.', 'PANCAKE_UNAVAILABLE');
        }
        console.warn(`Pancake listMessages failed for ${conversationId}, demo fallback enabled:`, err);
      }
    }

    if (!config.allowDemoMode) {
      throw new HttpError(503, 'Pancake chưa được cấu hình trên máy chủ.', 'PANCAKE_NOT_CONFIGURED');
    }

    // Fallback: fetch from SQLite database
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, conversation_id, sender, sender_name, text, attachments_json, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(conversationId, limit) as Array<{
      id: string;
      conversation_id: string;
      sender: string;
      sender_name: string | null;
      text: string;
      attachments_json: string | null;
      created_at: string;
    }>;

    const items = rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      sender: row.sender as 'student' | 'staff' | 'system',
      senderName: row.sender_name || undefined,
      text: row.text,
      attachments: parseAttachments(row.attachments_json),
      createdAt: row.created_at
    }));

    res.json({
      conversationId,
      items
    });
  })
);

function extractItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const candidates = [record.conversations, record.messages, record.data, record.items];
    const matched = candidates.find(Array.isArray);
    if (matched) return matched;
  }

  return [];
}

function assertPageAccess(req: Express.Request, pageIds: string[]) {
  const allowedPageId = req.staffAuth?.pageId;
  if (!allowedPageId || pageIds.some((pageId) => pageId !== allowedPageId)) {
    throw new HttpError(403, 'Không có quyền truy cập page này.', 'PAGE_ACCESS_DENIED');
  }
}

function getPageIds(value?: string) {
  const pageIds = (value || '')
    .split(',')
    .map((pageId) => pageId.trim())
    .filter(Boolean);

  if (pageIds.length) return Array.from(new Set(pageIds));
  if (config.pancake.pageId) return [config.pancake.pageId];
  return ['demo-page'];
}

function getTime(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function parseAttachments(raw?: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
