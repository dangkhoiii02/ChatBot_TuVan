import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';
import { verifyAppSession } from '../services/sessionToken.js';

export type StaffAuth = {
  userId: string;
  pageId: string;
  via: 'session' | 'dev_header';
};

declare global {
  namespace Express {
    interface Request {
      staffAuth?: StaffAuth;
    }
  }
}

/**
 * Staff APIs require a verified app session (Authorization: Bearer …).
 * Phase-1 X-User-Id is only accepted when ALLOW_DEV_USER_HEADER=1.
 */
export function requireActiveUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const bearer = readBearer(req);
    if (bearer) {
      const session = verifyAppSession(bearer);
      req.staffAuth = {
        userId: session.userId,
        pageId: session.pageId,
        via: 'session'
      };
      return next();
    }

    if (config.auth.allowDevUserHeader) {
      const userId = req.header('X-User-Id')?.trim() ?? '';
      if (userId && config.auth.envActiveUserIds.has(userId)) {
        req.staffAuth = {
          userId,
          pageId: config.pancake.pageId,
          via: 'dev_header'
        };
        return next();
      }
    }

    return next(
      new HttpError(401, 'Missing or invalid session. Login required.', 'AUTH_REQUIRED')
    );
  } catch (error) {
    return next(error);
  }
}

function readBearer(req: Request): string | undefined {
  const header = req.header('Authorization')?.trim();
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || undefined;
}
