import { Router } from 'express';
import { config, getPancakeAuthMode, isPancakeConfigured } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'pancake-demo-backend',
    pancakeConfigured: isPancakeConfigured(),
    pancakeAuthMode: getPancakeAuthMode(),
    aiProvider: config.ai.provider
  });
});
