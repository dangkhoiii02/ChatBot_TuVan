import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pancakeClient } from '../services/pancakeClient.js';
import { normalizeConversation, normalizeMessage } from '../services/pancakeNormalizer.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

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

    res.json({
      items
    });
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
    const raw = await pancakeClient.listMessages({
      pageId: query.pageId,
      conversationId,
      limit: query.limit ?? config.pancake.messageLimit,
      before: query.before
    });

    res.json({
      conversationId,
      items: extractItems(raw).map((item) => normalizeMessage(item, conversationId))
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

function getPageIds(value?: string) {
  const pageIds = (value || '')
    .split(',')
    .map((pageId) => pageId.trim())
    .filter(Boolean);

  if (pageIds.length) return Array.from(new Set(pageIds));
  if (config.pancake.pageId) return [config.pancake.pageId];

  throw new HttpError(400, 'Missing pageIds query parameter');
}

function getTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
