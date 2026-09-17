import type { NextFunction, Request, Response } from 'express';

function isAllowedOrigin(origin: string) {
  if (origin === 'http://localhost:5180' || origin === 'http://127.0.0.1:5180') return true;
  if (origin.startsWith('chrome-extension://')) return true;
  if (origin === 'http://127.0.0.1:5174' || origin === 'http://localhost:5174') return true;
  if (origin === 'http://127.0.0.1:5173' || origin === 'http://localhost:5173') return true;
  if (origin === 'http://127.0.0.1:4000' || origin === 'http://localhost:4000') return true;

  const extra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

/** Allow Vite widget/FE and chrome-extension:// packed widget → localhost API. */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.header('Origin');
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-User-Id, X-Skip-Auth, X-Gemini-Api-Key, X-Gemini-Model'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}
