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
const PAGES_CACHE_TTL_MS = 5 * 60 * 1000;
const cachedPageAccessTokens = new Map<string, string>();
let cachedPagesResponse: { value: unknown; expiresAt: number } | null = null;
let inflightPagesRequest: Promise<unknown> | null = null;

export const pancakeClient = {
  async listPages() {
    assertPancakeAccessTokenConfigured();

    const now = Date.now();
    if (cachedPagesResponse && cachedPagesResponse.expiresAt > now) {
      return cachedPagesResponse.value;
    }

    if (inflightPagesRequest) return inflightPagesRequest;

    inflightPagesRequest = requestPancakeUser('/v1/pages', {
      access_token: config.pancake.accessToken
    })
      .then((value) => {
        cachedPagesResponse = {
          value,
          expiresAt: Date.now() + PAGES_CACHE_TTL_MS
        };
        return value;
      })
      .catch((error) => {
        if (cachedPagesResponse && isTooManyRequestsError(error)) {
          return cachedPagesResponse.value;
        }

        throw error;
      })
      .finally(() => {
        inflightPagesRequest = null;
      });

    return inflightPagesRequest;
  },

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

async function requestPancakeUser(pathname: string, params: Record<string, string | undefined>) {
  const url = buildPancakeUrl(pathname, params);
  return requestPancake(url);
}

async function requestPancakePage(
  pageId: string,
  pathname: string,
  params: Record<string, string | undefined>
) {
  let pageAccessToken = await getPageAccessToken(pageId);
  let url = buildPancakeUrl(pathname, {
    ...params,
    page_access_token: pageAccessToken
  });

  try {
    return await requestPancake(url);
  } catch (error) {
    if (!canRetryWithGeneratedPageToken(error)) throw error;

    pageAccessToken = await generatePageAccessToken(pageId, config.pancake.accessToken);
    url = buildPancakeUrl(pathname, {
      ...params,
      page_access_token: pageAccessToken
    });

    return requestPancake(url);
  }
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
  if (!isPancakeConfigured()) {
    throw new HttpError(
      503,
      'Missing Pancake token in backend environment',
      'PANCAKE_NOT_CONFIGURED'
    );
  }
}

function assertPancakeAccessTokenConfigured() {
  if (!config.pancake.accessToken) {
    throw new HttpError(
      503,
      'Missing PANCAKE_ACCESS_TOKEN to list Pancake pages',
      'PANCAKE_ACCESS_TOKEN_MISSING'
    );
  }
}

async function getPageAccessToken(pageId: string) {
  assertPancakeConfigured();

  const cachedToken = cachedPageAccessTokens.get(pageId);
  if (cachedToken) return cachedToken;

  if (config.pancake.pageAccessToken && config.pancake.pageId && pageId === config.pancake.pageId) {
    cachedPageAccessTokens.set(pageId, config.pancake.pageAccessToken);
    return config.pancake.pageAccessToken;
  }

  return generatePageAccessToken(pageId, config.pancake.accessToken);
}

async function generatePageAccessToken(pageId: string, accessToken: string) {
  if (!accessToken) {
    throw new HttpError(
      503,
      'Missing PANCAKE_ACCESS_TOKEN to generate page_access_token',
      'PANCAKE_ACCESS_TOKEN_MISSING'
    );
  }

  const url = buildPancakeUrl(`/v1/pages/${pageId}/generate_page_access_token`, {
    access_token: accessToken
  });

  const body = await requestPancake(url, 'POST');
  const generatedToken = findPageAccessToken(body);

  if (!generatedToken) {
    throw new HttpError(
      502,
      'Pancake did not return a page_access_token',
      'PANCAKE_PAGE_TOKEN_NOT_FOUND'
    );
  }

  cachedPageAccessTokens.set(pageId, generatedToken);
  return generatedToken;
}

function canRetryWithGeneratedPageToken(error: unknown) {
  if (!(error instanceof HttpError)) return false;
  if (error.code !== 'PANCAKE_API_ERROR') return false;
  if (!/invalid access_token/i.test(error.message)) return false;
  return Boolean(config.pancake.accessToken);
}

function isTooManyRequestsError(error: unknown) {
  if (!(error instanceof HttpError)) return false;
  return error.statusCode === 429 || /too many requests/i.test(error.message);
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

function findPageAccessToken(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ['page_access_token', 'pageAccessToken', 'access_token']) {
    const token = record[key];
    if (typeof token === 'string' && token.trim()) return token;
  }

  for (const nestedValue of Object.values(record)) {
    const token = findPageAccessToken(nestedValue);
    if (token) return token;
  }

  return undefined;
}
