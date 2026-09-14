import { Router } from 'express';
import { z } from 'zod';
import { getDemoReplies, saveDemoReply } from '../services/demoReplyStore.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const demoRepliesRouter = Router();

const listQuerySchema = z.object({
  conversationId: z.string().optional()
});

const createReplySchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().trim().min(1),
  sourceSuggestionId: z.string().optional()
});

demoRepliesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const items = await getDemoReplies(query.conversationId);
    res.json({ items });
  })
);

demoRepliesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createReplySchema.parse(req.body);
    const item = await saveDemoReply(input);
    res.status(201).json({ ok: true, item });
  })
);
