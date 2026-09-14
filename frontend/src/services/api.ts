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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRecord;

  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `API error ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
