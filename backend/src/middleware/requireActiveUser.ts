import type { NextFunction, Request, Response } from 'express';
import { isActiveUserId } from '../config.js';
import { HttpError } from '../utils/httpError.js';

/** Staff APIs require header X-User-Id in PANCAKE_ACTIVE_USER_IDS allowlist. */
export function requireActiveUser(req: Request, _res: Response, next: NextFunction) {
  const userId = req.header('X-User-Id')?.trim() ?? '';

  if (!userId || !isActiveUserId(userId)) {
    return next(
      new HttpError(403, 'User is not active for this API', 'USER_NOT_ACTIVE')
    );
  }

  return next();
}
