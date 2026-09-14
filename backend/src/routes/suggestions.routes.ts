import { Router } from 'express';
import { z } from 'zod';
import { createSuggestions } from '../services/suggestionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const suggestionsRouter = Router();

const suggestionRequestSchema = z.object({
  conversationId: z.string().min(1),
  messages: z.array(
    z.object({
      id: z.string(),
      conversationId: z.string().optional(),
      sender: z.enum(['student', 'staff', 'system']),
      senderName: z.string().optional(),
      text: z.string().default(''),
      attachments: z.array(z.unknown()).optional().default([]),
      createdAt: z.string()
    })
  )
});

suggestionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = suggestionRequestSchema.parse(req.body);
    const result = await createSuggestions(input);
    res.json(result);
  })
);
