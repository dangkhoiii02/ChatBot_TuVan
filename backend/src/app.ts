import { ZodError } from 'zod';
import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { requireActiveUser } from './middleware/requireActiveUser.js';
import { authRouter } from './routes/auth.routes.js';
import { demoRepliesRouter } from './routes/demoReplies.routes.js';
import { conversationsRouter } from './routes/conversations.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { pagesRouter } from './routes/pages.routes.js';
import { suggestionsRouter } from './routes/suggestions.routes.js';
import { HttpError } from './utils/httpError.js';

export function createApp() {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  // Staff APIs: Bearer app session (optional phase-1 header if ALLOW_DEV_USER_HEADER=1)
  app.use('/api/pages', requireActiveUser, pagesRouter);
  app.use('/api/conversations', requireActiveUser, conversationsRouter);
  app.use('/api/suggestions', requireActiveUser, suggestionsRouter);
  app.use('/api/demo-replies', requireActiveUser, demoRepliesRouter);

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
      if (error instanceof ZodError) return res.status(400).json({ error: 'Dữ liệu yêu cầu không hợp lệ', issues: error.issues.map(({ path, message }) => ({ path, message })) });
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }

      const message = error instanceof Error ? error.message : 'Unexpected server error';

      return res.status(500).json({
        error: message
      });
    }
  );

  return app;
}
