import { resolveAI } from '../../../shared/ai-provider.cjs';
import { HttpError } from '../utils/httpError.js';
import { Router } from 'express';
import { z } from 'zod';
import { createSuggestions } from '../services/suggestionService.js';
import { resolveReplyContext } from '../services/replyContextService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const suggestionsRouter = Router();

const suggestionRequestSchema = z.object({
  conversationId: z.string().min(1),
  studentId: z.string().trim().min(1).max(200).optional(),
  contextRevision: z.number().int().nonnegative().optional(),
  mode: z.enum(['chat', 'teacher_review']).optional().default('chat'),
  teacherInput: z.string().trim().max(2000).optional(),
  pronouns: z
    .object({
      senderCall: z.string().min(1),
      recipientCall: z.string().min(1),
      label: z.string().optional()
    })
    .optional(),
  provider: z.string().trim().max(40).optional(),
  baseUrl: z.string().trim().max(2048).optional(),
  apiKey: z.string().trim().max(4096).optional(),
  model: z.string().trim().max(200).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        conversationId: z.string().optional(),
        sender: z.enum(['student', 'staff', 'system']),
        senderName: z.string().optional(),
        text: z.string().default(''),
        attachments: z.array(z.unknown()).optional().default([]),
        createdAt: z.string().optional().default(() => new Date().toISOString())
      })
    )
    .max(100)
    .optional()
    .default([])
});

suggestionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = suggestionRequestSchema.parse(req.body);
    if (input.mode === 'teacher_review' && !input.teacherInput?.trim()) {
      throw new HttpError(400, 'teacherInput là bắt buộc khi ở chế độ chấm bài (teacher_review)');
    }

    const headerKey = req.headers['x-gemini-api-key'] as string | undefined;
    const headerModel = req.headers['x-gemini-model'] as string | undefined;

    const request = {
      ...input,
      apiKey: input.apiKey || headerKey,
      model: input.model || headerModel
    };
    try { resolveAI(request); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Cấu hình AI không hợp lệ'); }
    const messages = input.mode === 'chat'
      ? await resolveReplyContext({
          conversationId: input.conversationId,
          pageId: req.staffAuth?.pageId,
          messages: input.messages
        })
      : input.messages;
    if (input.mode === 'chat' && !messages.some((message) => message.sender === 'student')) {
      throw new HttpError(409, 'Không có cụm tin nhắn mới nào của học viên đang chờ trả lời.', 'NO_PENDING_STUDENT_MESSAGES');
    }
    const result = await createSuggestions({ ...request, messages });
    res.json({ ...result, requestId: String(res.locals.requestId || '') });
  })
);
