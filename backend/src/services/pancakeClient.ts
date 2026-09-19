import { config, isPancakeConfigured } from '../config.js';
import { HttpError } from '../utils/httpError.js';

type ListConversationsInput = {
  pageId?: string;
  limit: number;
  since?: string;
  until?: string;
};

type ListMessagesInput = {
  pageId?: string;
  conversationId: string;
  limit: number;
  before?: string;
};

const REQUEST_TIMEOUT_MS = 12_000;
const cachedPageAccessTokens = new Map<string, string>();

export const pancakeClient = {
  async listConversations(input: ListConversationsInput) {
    const pageId = resolvePageId(input.pageId);

    return requestPancakePage(pageId, `/public_api/v2/pages/${pageId}/conversations`, {
      limit: String(input.limit),
      since: input.since,
      until: input.until
    });
  },

  async listMessages(input: ListMessagesInput) {
    const pageId = resolvePageId(input.pageId);

    return requestPancakePage(
      pageId,
      `/public_api/v1/pages/${pageId}/conversations/${input.conversationId}/messages`,
      {
        limit: String(input.limit),
        before: input.before
      }
    );
  }
};

export function cachePancakePageAccessToken(pageId: string, token: string) {
  const normalizedPageId = pageId.trim();
  const normalizedToken = token.trim();
  if (normalizedPageId && normalizedToken) cachedPageAccessTokens.set(normalizedPageId, normalizedToken);
}

export function hasPancakePageAccess(pageId?: string) {
  const normalizedPageId = pageId?.trim();
  if (normalizedPageId && cachedPageAccessTokens.has(normalizedPageId)) return true;
  return Boolean(
    config.pancake.pageId &&
      config.pancake.pageAccessToken &&
      (!normalizedPageId || normalizedPageId === config.pancake.pageId)
  );
}

export function hasAnyPancakePageAccess() {
  return cachedPageAccessTokens.size > 0 || isPancakeConfigured();
}

async function requestPancakePage(
  pageId: string,
  pathname: string,
  params: Record<string, string | undefined>
) {
  const pageAccessToken = getPageAccessToken(pageId);
  const url = buildPancakeUrl(pathname, {
    ...params,
    page_access_token: pageAccessToken
  });

  return requestPancake(url);
}

function buildPancakeUrl(pathname: string, params: Record<string, string | undefined>) {
  const url = new URL(`${config.pancake.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  return url;
}

async function requestPancake(url: URL, method: 'GET' | 'POST' = 'GET') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });

    const text = await response.text();
    const body = parseJson(text);

    if (!response.ok) {
      throw new HttpError(
        response.status,
        getPancakeErrorMessage(body) ?? `Pancake API returned ${response.status}`,
        'PANCAKE_API_ERROR'
      );
    }

    if (isPancakeBusinessError(body)) {
      throw new HttpError(
        400,
        getPancakeErrorMessage(body) ?? 'Pancake API returned an error',
        'PANCAKE_API_ERROR'
      );
    }

    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'Pancake API request timed out', 'PANCAKE_TIMEOUT');
    }
    throw new HttpError(502, 'Could not reach Pancake API', 'PANCAKE_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

function resolvePageId(pageId?: string) {
  const resolvedPageId = pageId?.trim() || config.pancake.pageId;

  if (!resolvedPageId) {
    throw new HttpError(
      503,
      'Missing Pancake page id. Select a page or set PANCAKE_PAGE_ID.',
      'PANCAKE_PAGE_ID_MISSING'
    );
  }

  assertPancakeConfigured();
  return resolvedPageId;
}

function assertPancakeConfigured() {
  if (!hasAnyPancakePageAccess()) {
    throw new HttpError(
      503,
      'Missing PANCAKE_PAGE_ACCESS_TOKEN and/or PANCAKE_PAGE_ID in backend environment',
      'PANCAKE_NOT_CONFIGURED'
    );
  }
}

/** Only env page token — no generate from user access_token. */
function getPageAccessToken(pageId: string) {
  const cachedToken = cachedPageAccessTokens.get(pageId);
  if (cachedToken) return cachedToken;

  assertPancakeConfigured();

  if (config.pancake.pageId && pageId !== config.pancake.pageId) {
    throw new HttpError(
      503,
      'Single-page mode: only PANCAKE_PAGE_ID is supported',
      'PANCAKE_SINGLE_PAGE_ONLY'
    );
  }

  cachedPageAccessTokens.set(pageId, config.pancake.pageAccessToken);
  return config.pancake.pageAccessToken;
}

function parseJson(text: string) {
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function getPancakeErrorMessage(body: unknown) {
  if (!body || typeof body !== 'object') return undefined;

  const record = body as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;

  const nestedError = record.error;
  if (nestedError && typeof nestedError === 'object') {
    const nested = nestedError as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
  }

  return undefined;
}

function isPancakeBusinessError(body: unknown) {
  if (!body || typeof body !== 'object') return false;

  const record = body as Record<string, unknown>;
  return record.success === false || Boolean(record.error_code);
}
