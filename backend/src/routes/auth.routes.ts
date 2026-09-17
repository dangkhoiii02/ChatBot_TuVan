import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { loginWithPancakeUserToken } from '../services/pancakeLogin.js';
import { issueAppSession } from '../services/sessionToken.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const authRouter = Router();

const loginBodySchema = z.object({
  accessToken: z.string().min(1)
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Body must include accessToken', 'INVALID_BODY');
    }

    if (!config.auth.sessionSecret) {
      throw new HttpError(503, 'Missing APP_SESSION_SECRET', 'SESSION_SECRET_MISSING');
    }

    const login = await loginWithPancakeUserToken(parsed.data.accessToken);
    const sessionToken = issueAppSession({
      userId: login.userId,
      pageId: login.pageId
    });

    res.json({
      sessionToken,
      tokenType: 'Bearer',
      expiresIn: config.auth.sessionTtlSeconds,
      userId: login.userId,
      pageId: login.pageId
    });
  })
);
