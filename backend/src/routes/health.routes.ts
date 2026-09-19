import { Router } from 'express';
import { config, getPancakeAuthMode } from '../config.js';
import { hasAnyPancakePageAccess } from '../services/pancakeClient.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'pancake-backend',
    pancakeConfigured: hasAnyPancakePageAccess(),
    pancakeAuthMode: getPancakeAuthMode(),
    aiProvider: config.ai.provider
  });
});
