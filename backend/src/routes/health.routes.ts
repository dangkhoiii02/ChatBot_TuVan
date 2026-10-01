import { Router } from 'express';
import { config, getPancakeAuthMode } from '../config.js';
import { hasAnyPancakePageAccess } from '../services/pancakeClient.js';
import { resolveAI } from '../../../shared/ai-provider.cjs';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  let aiProvider: string = config.ai.provider;
  let aiModel = '';
  let aiConfigured = false;
  try {
    const settings = resolveAI({});
    aiProvider = settings.provider;
    aiModel = settings.model;
    aiConfigured = settings.provider !== 'mock';
  } catch {
    aiModel = process.env.AI_PROVIDER_MODEL || process.env.AI_MODEL || process.env.GEMINI_MODEL || '';
  }
  res.json({
    ok: true,
    service: 'pancake-backend',
    pancakeConfigured: hasAnyPancakePageAccess(),
    pancakeAuthMode: getPancakeAuthMode(),
    aiProvider,
    aiModel,
    aiConfigured
  });
});
