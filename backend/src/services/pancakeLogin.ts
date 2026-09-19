import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';
import { activeUsersCache } from './activeUsersCache.js';
import { extractUidFromAccessToken } from './sessionToken.js';
import { cachePancakePageAccessToken } from './pancakeClient.js';

const REQUEST_TIMEOUT_MS = 12_000;

export type LoginResult = {
  userId: string;
  pageId: string;
  activeUserIds: string[];
};

export async function loginWithPancakeUserToken(accessToken: string): Promise<LoginResult> {
  const token = accessToken.trim();
  if (!token) {
    throw new HttpError(400, 'Missing accessToken', 'ACCESS_TOKEN_REQUIRED');
  }

  const isDemo = ['demo', 'mock', 'test'].includes(token.toLowerCase()) || token.startsWith('demo_');
  if (isDemo && (config.nodeEnv === 'production' || !config.allowDemoMode)) {
    throw new HttpError(403, 'Demo login is disabled in production');
  }
  if (isDemo) {
    const demoPageId = config.pancake.pageId.trim() || 'demo-page';
    const demoUserId = 'demo_user';
    activeUsersCache.set(demoPageId, new Set([demoUserId]));
    return {
      userId: demoUserId,
      pageId: demoPageId,
      activeUserIds: [demoUserId]
    };
  }

  try {
    const pagesRaw = await fetchPancakePages(token);
    const configuredPageId = config.pancake.pageId.trim();
    const page = configuredPageId
      ? findPageById(pagesRaw, configuredPageId)
      : firstAccessiblePage(pagesRaw);
    if (!page) {
      throw new HttpError(403, 'Token không có page Pancake đang hoạt động.', 'PAGE_NOT_FOUND');
    }

    const pageId = readPageId(page);
    if (!pageId) throw new HttpError(502, 'Pancake không trả về page ID.', 'PAGE_ID_MISSING');

    const userId = extractUidFromAccessToken(token);
    if (!userId) {
      throw new HttpError(400, 'Could not read uid from accessToken JWT', 'UID_NOT_FOUND');
    }

    const activeUserIds = resolveActiveUserIds(page);
    if (activeUserIds.size > 0 && !activeUserIds.has(userId)) {
      throw new HttpError(403, 'User is not active for this page', 'USER_NOT_ACTIVE');
    }
    activeUserIds.add(userId);

    const pageAccessToken = readPageAccessToken(page);
    if (pageAccessToken) cachePancakePageAccessToken(pageId, pageAccessToken);
    else if (!(config.pancake.pageId === pageId && config.pancake.pageAccessToken)) {
      throw new HttpError(502, 'Pancake không trả về page access token.', 'PAGE_ACCESS_TOKEN_MISSING');
    }

    activeUsersCache.set(pageId, activeUserIds);

    return {
      userId,
      pageId,
      activeUserIds: [...activeUserIds]
    };
  } catch (error) {
    throw error;
  }
}

function firstAccessiblePage(raw: unknown): Record<string, unknown> | undefined {
  return extractPageItems(raw).find(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')
  );
}

function readPageId(page: Record<string, unknown>) {
  const value = page.id ?? page.page_id ?? page.pageId;
  return value == null ? '' : String(value).trim();
}

function readPageAccessToken(page: Record<string, unknown>) {
  for (const value of [page.page_access_token, page.pageAccessToken, page.access_token, page.accessToken]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function fetchPancakePages(accessToken: string) {
  const url = new URL(`${config.pancake.baseUrl}/v1/pages`);
  url.searchParams.set('access_token', accessToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      throw new HttpError(
        response.status === 401 || response.status === 403 ? 403 : 502,
        pancakeMessage(body) ?? `Pancake pages returned ${response.status}`,
        'PANCAKE_LOGIN_FAILED'
      );
    }

    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'Pancake login timed out', 'PANCAKE_TIMEOUT');
    }
    throw new HttpError(502, 'Could not reach Pancake API', 'PANCAKE_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

function findPageById(raw: unknown, pageId: string): Record<string, unknown> | undefined {
  for (const item of extractPageItems(raw)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = record.id ?? record.page_id ?? record.pageId;
    if (String(id) === pageId) return record;
  }
  return undefined;
}

function extractPageItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];

  const record = raw as Record<string, unknown>;
  const categorized = record.categorized as Record<string, unknown> | undefined;
  if (categorized && Array.isArray(categorized.activated)) {
    return categorized.activated;
  }

  for (const key of ['pages', 'data', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

function resolveActiveUserIds(page: Record<string, unknown>): Set<string> {
  const fromPage = coerceIdList(
    page.active_user_ids ?? page.activeUserIds ?? page.active_users ?? page.activeUsers
  );

  if (fromPage.size > 0) return fromPage;

  if (config.auth.enableEnvActiveUserFallback && config.auth.envActiveUserIds.size > 0) {
    return new Set(config.auth.envActiveUserIds);
  }

  return new Set();
}

function coerceIdList(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!value) return ids;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) ids.add(item.trim());
      else if (typeof item === 'number') ids.add(String(item));
      else if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const id = record.id ?? record.uid ?? record.user_id ?? record.userId;
        if (typeof id === 'string' && id.trim()) ids.add(id.trim());
        else if (typeof id === 'number') ids.add(String(id));
      }
    }
    return ids;
  }

  if (typeof value === 'string') {
    for (const part of value.split(',')) {
      const trimmed = part.trim();
      if (trimmed) ids.add(trimmed);
    }
  }

  return ids;
}

function pancakeMessage(body: unknown) {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;
  return undefined;
}
