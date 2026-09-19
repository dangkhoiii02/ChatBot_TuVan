import { Router } from 'express';
import { z } from 'zod';
import { requestAI, resolveAI } from '../../../shared/ai-provider.cjs';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const aiRouter = Router();

const validateSchema = z.object({
  mode: z.enum(['system', 'user_override']),
  provider: z.string().trim().max(40).optional(),
  apiKey: z.string().trim().max(4096).optional(),
  model: z.string().trim().max(200).optional(),
  baseUrl: z.string().trim().max(2048).optional()
});

aiRouter.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const input = validateSchema.parse(req.body);
    let settings;
    try {
      settings = resolveAI(
        input.mode === 'system'
          ? {}
          : {
              provider: input.provider,
              apiKey: input.apiKey,
              model: input.model,
              baseUrl: input.baseUrl
            }
      );
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : 'Cấu hình AI không hợp lệ.',
        'AI_CONFIG_INVALID'
      );
    }

    if (settings.provider === 'mock') {
      throw new HttpError(
        503,
        'Máy chủ chưa có cấu hình AI thật. Hãy cấu hình server hoặc dùng key riêng.',
        'AI_NOT_CONFIGURED'
      );
    }

    try {
      await requestAI(
        settings,
        'Đây là kiểm tra kết nối. Không sử dụng dữ liệu người dùng.',
        'Trả JSON với replies gồm đúng một phần tử tone "Kiểm tra" và content "OK".'
      );
    } catch (error) {
      throw new HttpError(
        502,
        error instanceof Error ? error.message : 'Không kiểm tra được kết nối AI.',
        'AI_CONNECTION_FAILED'
      );
    }

    res.json({ ok: true, provider: settings.provider, model: settings.model });
  })
);
