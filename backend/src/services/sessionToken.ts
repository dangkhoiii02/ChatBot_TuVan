import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertSessionSecretConfigured, config } from '../config.js';
import { HttpError } from '../utils/httpError.js';

export type AppSessionPayload = {
  userId: string;
  pageId: string;
  exp: number;
  iat: number;
};

function b64urlEncode(input: string | Buffer) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(input: string) {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(content: string) {
  assertSessionSecretConfigured();
  return createHmac('sha256', config.auth.sessionSecret).update(content).digest();
}

export function issueAppSession(input: { userId: string; pageId: string }) {
  assertSessionSecretConfigured();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + config.auth.sessionTtlSeconds;
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(
    JSON.stringify({
      userId: input.userId,
      pageId: input.pageId,
      iat,
      exp
    } satisfies AppSessionPayload)
  );
  const signingInput = `${header}.${payload}`;
  const signature = b64urlEncode(sign(signingInput));
  return `${signingInput}.${signature}`;
}

export function verifyAppSession(token: string): AppSessionPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new HttpError(401, 'Invalid session token', 'SESSION_INVALID');
  }

  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;
  const expected = sign(signingInput);
  const actual = b64urlDecode(signature);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(401, 'Invalid session token', 'SESSION_INVALID');
  }

  let parsed: AppSessionPayload;
  try {
    parsed = JSON.parse(b64urlDecode(payload).toString('utf8')) as AppSessionPayload;
  } catch {
    throw new HttpError(401, 'Invalid session token', 'SESSION_INVALID');
  }

  if (!parsed?.userId || !parsed?.pageId || typeof parsed.exp !== 'number') {
    throw new HttpError(401, 'Invalid session token', 'SESSION_INVALID');
  }

  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'Session expired', 'SESSION_EXPIRED');
  }

  if (config.pancake.pageId && parsed.pageId !== config.pancake.pageId) {
    throw new HttpError(403, 'Session page mismatch', 'SESSION_PAGE_MISMATCH');
  }

  return parsed;
}

/** Decode Pancake user JWT payload without verifying signature (verify via Pancake API). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(b64urlDecode(parts[1]).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractUidFromAccessToken(accessToken: string): string | undefined {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return undefined;

  for (const key of ['uid', 'user_id', 'userId', 'sub']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return undefined;
}
