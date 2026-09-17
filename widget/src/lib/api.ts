import { clearAppSession, getSessionToken, setAppSession } from './session';

type JsonRecord = Record<string, unknown>;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';

export type LoginResult = {
  sessionToken: string;
  tokenType: string;
  expiresIn: number;
  userId: string;
  pageId: string;
};

export type ApiChatMessage = {
  id: string;
  conversationId: string;
  sender: 'student' | 'staff' | 'system';
  senderName?: string;
  text: string;
  attachments?: unknown[];
  createdAt: string;
};

export type SuggestionApiResult = {
  intent?: string;
  sensitivity?: string;
  suggestions: Array<{ id: string; tone: string; content: string }>;
};

export async function loginWithPancakeAccessToken(accessToken: string) {
  const data = await requestJson<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ accessToken }),
    headers: { 'X-Skip-Auth': '1' },
  });
  setAppSession({
    sessionToken: data.sessionToken,
    userId: data.userId,
    pageId: data.pageId,
    expiresAt: Date.now() + Math.max(60, (data.expiresIn || 43200) - 30) * 1000,
  });
  return data;
}

export function logoutAppSession() {
  clearAppSession();
}

export async function getConversationMessages(
  conversationId: string,
  pageId?: string | null,
  limit = 30,
) {
  const search = new URLSearchParams({ limit: String(limit) });
  if (pageId) search.set('pageId', pageId);
  const data = await requestJson<{ conversationId: string; items: ApiChatMessage[] }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${search.toString()}`,
  );
  return data.items;
}

export async function createSuggestions(input: {
  conversationId: string;
  messages: Array<{
    id: string;
    conversationId?: string;
    sender: 'student' | 'staff' | 'system';
    senderName?: string;
    text: string;
    attachments?: unknown[];
    createdAt: string;
  }>;
}) {
  return requestJson<SuggestionApiResult>('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  delete headers['X-Skip-Auth'];

  const skipAuth = path.startsWith('/api/auth/login') || path.startsWith('/api/health');
  const sessionToken = getSessionToken();
  if (!skipAuth && sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : '';
    const message =
      typeof payload.error === 'string' ? payload.error : `API error ${response.status}`;
    throw new Error(code ? `${code}: ${message}` : message);
  }
  return payload as T;
}

