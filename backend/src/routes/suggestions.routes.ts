import { resolveAI } from '../../../shared/ai-provider.cjs';
import { HttpError } from '../utils/httpError.js';
import { Router } from 'express';
import { z } from 'zod';
import { createSuggestions } from '../services/suggestionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const suggestionsRouter = Router();

const suggestionRequestSchema = z.object({
  conversationId: z.string().min(1),
  provider: z.string().trim().max(40).optional(),
  baseUrl: z.string().trim().max(2048).optional(),
  apiKey: z.string().trim().max(4096).optional(),
  model: z.string().trim().max(200).optional(),
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
  ).min(1).max(100)
});

suggestionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = suggestionRequestSchema.parse(req.body);
    const headerKey = req.headers['x-gemini-api-key'] as string | undefined;
    const headerModel = req.headers['x-gemini-model'] as string | undefined;

    const request = {
      ...input,
      apiKey: input.apiKey || headerKey,
      model: input.model || headerModel
    };
    try { resolveAI(request); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Cấu hình AI không hợp lệ'); }
    const result = await createSuggestions(request);
    res.json(result);
  })
);
