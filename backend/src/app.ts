import { ZodError } from 'zod';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { corsMiddleware } from './middleware/cors.js';
import { requireActiveUser } from './middleware/requireActiveUser.js';
import { authRouter } from './routes/auth.routes.js';
import { conversationsRouter } from './routes/conversations.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { pagesRouter } from './routes/pages.routes.js';
import { suggestionsRouter } from './routes/suggestions.routes.js';
import { studentsRouter } from './routes/students.routes.js';
import { studentLearningRouter } from './routes/studentLearning.routes.js';
import { aiRouter } from './routes/ai.routes.js';
import { HttpError } from './utils/httpError.js';

export function createApp() {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const requestId = req.header('X-Request-Id')?.trim() || randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  // Staff APIs: Bearer app session (optional phase-1 header if ALLOW_DEV_USER_HEADER=1)
  app.use('/api/pages', requireActiveUser, pagesRouter);
  app.use('/api/conversations', requireActiveUser, conversationsRouter);
  app.use('/api/suggestions', requireActiveUser, suggestionsRouter);
  app.use('/api/students', requireActiveUser, studentLearningRouter);
  app.use('/api/students', requireActiveUser, studentsRouter);
  app.use('/api/ai', requireActiveUser, aiRouter);

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'Route not found'));
  });

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const requestId = String(res.locals.requestId || '');
      if (error instanceof ZodError) return res.status(400).json({ error: 'Dữ liệu yêu cầu không hợp lệ', code: 'VALIDATION_ERROR', requestId, issues: error.issues.map(({ path, message }) => ({ path, message })) });
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          requestId
        });
      }

      const message =
        process.env.NODE_ENV === 'production'
          ? 'Có lỗi máy chủ. Vui lòng thử lại hoặc cung cấp mã yêu cầu cho quản trị viên.'
          : error instanceof Error
            ? error.message
            : 'Unexpected server error';

      return res.status(500).json({
        error: message,
        code: 'INTERNAL_ERROR',
        requestId
      });
    }
  );

  return app;
}
