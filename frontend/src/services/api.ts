import { getSessionToken, setAppSession, clearAppSession } from '../lib/session';
import { getStaffUserId } from '../lib/userId';
import type {
  BackendChatMessage,
  BackendConversationSummary,
  BackendHealth,
  BackendPageSummary,
  BackendSuggestionResult,
  ChatMessage,
  DemoReply
} from '../types';

type JsonRecord = Record<string, unknown>;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export type LoginResult = {
  sessionToken: string;
  tokenType: 'Bearer' | string;
  expiresIn: number;
  userId: string;
  pageId: string;
};

export async function loginWithPancakeAccessToken(accessToken: string) {
  const data = await requestJson<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ accessToken }),
    // login must not require existing session
    headers: { 'X-Skip-Auth': '1' }
  });
  setAppSession({
    sessionToken: data.sessionToken,
    userId: data.userId,
    pageId: data.pageId,
    expiresAt: Date.now() + Math.max(60, data.expiresIn - 30) * 1000
  });
  return data;
}

export function logoutAppSession() {
  clearAppSession();
}


export async function getHealth() {
  return requestJson<BackendHealth>('/api/health');
}

export async function getPages() {
  return requestJson<{ items: BackendPageSummary[]; defaultSelectedPageIds: string[] }>('/api/pages');
}

export async function getConversations(pageIds: string[], limit = 30) {
  const search = new URLSearchParams({
    pageIds: pageIds.join(','),
    limit: String(limit)
  });
  const data = await requestJson<{ items: BackendConversationSummary[] }>(
    `/api/conversations?${search.toString()}`
  );
  return data.items;
}

export async function getConversationMessages(conversationId: string, pageId: string, limit = 30) {
  const search = new URLSearchParams({
    pageId,
    limit: String(limit)
  });
  const data = await requestJson<{ conversationId: string; items: BackendChatMessage[] }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${search.toString()}`
  );
  return data.items;
}

export async function createSuggestions(input: {
  conversationId: string;
  messages: ChatMessage[];
}) {
  return requestJson<BackendSuggestionResult>('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: input.conversationId,
      messages: input.messages.map((message) => ({
        id: message.id,
        conversationId: input.conversationId,
        sender: message.sender,
        text: message.text,
        attachments: message.attachments || [],
        createdAt: message.createdAt || new Date().toISOString()
      }))
    })
  });
}

export async function saveDemoReply(input: {
  conversationId: string;
  content: string;
  sourceSuggestionId?: string;
}) {
  const data = await requestJson<{ ok: true; item: DemoReply }>('/api/demo-replies', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  return data.item;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined)
  };
  delete headers['X-Skip-Auth'];

  const skipAuth = path.startsWith('/api/auth/login') || path.startsWith('/api/health');
  const sessionToken = getSessionToken();
  if (!skipAuth && sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  // Phase-1 fallback only when ALLOW_DEV_USER_HEADER is enabled on FE + BE.
  const allowDevHeader =
    import.meta.env.VITE_ALLOW_DEV_USER_HEADER === '1' ||
    import.meta.env.VITE_ALLOW_DEV_USER_HEADER === 'true';
  if (!skipAuth && allowDevHeader && !sessionToken) {
    const staffUserId = getStaffUserId();
    if (staffUserId) headers['X-User-Id'] = staffUserId;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRecord;

  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : '';
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : `API error ${response.status}`;
    if (response.status === 401 || code === 'AUTH_REQUIRED') {
      throw new Error(code ? `${code}: ${message}` : `AUTH_REQUIRED: ${message}`);
    }
    if (response.status === 403 && (code === 'USER_NOT_ACTIVE' || code === 'USER_NOT_ACTIVE')) {
      throw new Error(`${code || 'USER_NOT_ACTIVE'}: ${message}`);
    }
    throw new Error(code ? `${code}: ${message}` : message);
  }

  return payload as T;
}
