import { getAIRequestOverride, readAISettings, type AISettings } from '../../../shared/ai-settings';
import { getSessionToken, setAppSession, clearAppSession } from '../lib/session';
import { getStaffUserId } from '../lib/userId';
import type {
  BackendChatMessage,
  BackendConversationSummary,
  BackendHealth,
  BackendPageSummary,
  BackendSuggestionResult,
  ChatMessage,
  PronounPair,
  StudentContext,
  StudentProfile,
  CustomField
} from '../types';

type JsonRecord = Record<string, unknown>;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly issues?: Array<{ path: Array<string | number>; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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


export async function getHealth(signal?: AbortSignal) {
  return requestJson<BackendHealth>('/api/health', { signal });
}

export async function getPages(signal?: AbortSignal) {
  return requestJson<{ items: BackendPageSummary[]; defaultSelectedPageIds: string[] }>('/api/pages', { signal });
}

export async function getConversations(pageIds: string[], limit = 30, signal?: AbortSignal) {
  const search = new URLSearchParams({
    pageIds: pageIds.join(','),
    limit: String(limit)
  });
  const data = await requestJson<{ items: BackendConversationSummary[] }>(
    `/api/conversations?${search.toString()}`,
    { signal }
  );
  return data.items;
}

export async function getConversationMessages(
  conversationId: string,
  pageId: string,
  limit = 30,
  signal?: AbortSignal
) {
  const search = new URLSearchParams({
    pageId,
    limit: String(limit)
  });
  const data = await requestJson<{ conversationId: string; items: BackendChatMessage[] }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${search.toString()}`,
    { signal }
  );
  return data.items;
}

export async function createSuggestions(input: {
  conversationId: string;
  studentId?: string;
  contextRevision?: number;
  pronouns?: PronounPair;
  messages: ChatMessage[];
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}) {
  const stored = readAISettings();
  const explicit = input.apiKey || input.model || input.provider || input.baseUrl
    ? {
        apiKey: input.apiKey,
        model: input.model,
        provider: input.provider,
        baseUrl: input.baseUrl
      }
    : getAIRequestOverride(stored);

  return requestJson<BackendSuggestionResult>('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: input.conversationId,
      studentId: input.studentId,
      contextRevision: input.contextRevision,
      pronouns: input.pronouns,
      ...explicit,
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

export async function createTeacherReview(input: {
  conversationId: string;
  teacherInput: string;
  pronouns?: PronounPair;
  messages?: ChatMessage[];
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}) {
  const stored = readAISettings();
  const explicit = input.apiKey || input.model || input.provider || input.baseUrl
    ? {
        apiKey: input.apiKey,
        model: input.model,
        provider: input.provider,
        baseUrl: input.baseUrl
      }
    : getAIRequestOverride(stored);

  return requestJson<BackendSuggestionResult>('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: input.conversationId,
      mode: 'teacher_review',
      teacherInput: input.teacherInput,
      pronouns: input.pronouns,
      ...explicit,
      messages: (input.messages || []).map((message) => ({
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

export async function getStudentContext(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({ pageId: input.pageId, studentName: input.studentName });
  return requestJson<StudentContext>(
    `/api/students/${encodeURIComponent(input.studentId)}/context?${query.toString()}`,
    { signal: input.signal }
  );
}

export async function saveStudentProfile(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  profile: StudentProfile;
}) {
  const { customFields: _customFields, ...profile } = input.profile;
  return requestJson<StudentContext>(`/api/students/${encodeURIComponent(input.studentId)}/profile`, {
    method: 'PATCH',
    body: JSON.stringify({
      pageId: input.pageId,
      studentName: input.studentName,
      revision: input.revision,
      profile
    })
  });
}

export async function createStudentMemory(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  content: string;
  reason?: string;
  reviewAt?: string;
}) {
  return requestJson<StudentContext>(`/api/students/${encodeURIComponent(input.studentId)}/memories`, {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function updateStudentMemory(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  memoryId: string;
  action: 'update' | 'activate' | 'archive' | 'restore';
  content?: string;
  reason?: string;
  reviewAt?: string | null;
}) {
  const { studentId, memoryId, ...body } = input;
  return requestJson<StudentContext>(
    `/api/students/${encodeURIComponent(studentId)}/memories/${encodeURIComponent(memoryId)}`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

export async function deleteStudentMemory(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  memoryId: string;
}) {
  const { studentId, memoryId, ...body } = input;
  return requestJson<StudentContext>(
    `/api/students/${encodeURIComponent(studentId)}/memories/${encodeURIComponent(memoryId)}`,
    { method: 'DELETE', body: JSON.stringify(body) }
  );
}

export async function createStudentCustomField(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  field: Omit<CustomField, 'id' | 'createdAt' | 'updatedAt' | 'source'> & {
    source?: CustomField['source'];
  };
}) {
  return requestJson<StudentContext>(`/api/students/${encodeURIComponent(input.studentId)}/custom-fields`, {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function updateStudentCustomField(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  fieldId: string;
  value?: string;
  useInSuggestions?: boolean;
  hidden?: boolean;
}) {
  const { studentId, fieldId, ...body } = input;
  return requestJson<StudentContext>(
    `/api/students/${encodeURIComponent(studentId)}/custom-fields/${encodeURIComponent(fieldId)}`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

export async function deleteStudentCustomField(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  fieldId: string;
}) {
  const { studentId, fieldId, ...body } = input;
  return requestJson<StudentContext>(
    `/api/students/${encodeURIComponent(studentId)}/custom-fields/${encodeURIComponent(fieldId)}`,
    { method: 'DELETE', body: JSON.stringify(body) }
  );
}

export async function validateAIConnection(settings: AISettings) {
  const override = getAIRequestOverride(settings);
  return requestJson<{ ok: true; provider: string; model: string }>('/api/ai/validate', {
    method: 'POST',
    body: JSON.stringify({ mode: settings.mode, ...override })
  });
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
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
    if (response.status === 401 || code === 'AUTH_REQUIRED' || code === 'SESSION_EXPIRED') {
      clearAppSession();
      window.dispatchEvent(new Event('ttd:session-expired'));
    }
    const issues = Array.isArray(payload.issues)
      ? (payload.issues as Array<{ path: Array<string | number>; message: string }>)
      : undefined;
    throw new ApiError(
      message,
      response.status,
      code || `HTTP_${response.status}`,
      typeof payload.requestId === 'string'
        ? payload.requestId
        : response.headers.get('X-Request-Id') || requestId,
      issues
    );
  }

  return payload as T;
}
