import { clearAppSession, getSessionToken, setAppSession } from './session';

type JsonRecord = Record<string, unknown>;

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
  provider?: string;
  isDemoFallback?: boolean;
  analysis?: string;
  intent?: string;
  sensitivity?: string;
  identityStatus?: 'linked' | 'needs_selection';
  contextVersion?: string | null;
  reviewSessionId?: string | null;
  usedFacts?: Array<{id:string;kind:string;content:string;sourceMessageId?:string;sourceText?:string}>;
  historyCoverage?: {status:string;oldestMessageAt?:string|null;lastSyncedAt?:string|null};
  suggestions: Array<{ id: string; tone: string; content: string }>;
};

export type StudentOptionApi={id:string;name:string;revision?:number;updatedAt?:string};
export type StudentIdentityApi={pageId:string;conversationId:string;customerId?:string|null;customerName:string;status:'linked'|'needs_selection';
  student:StudentOptionApi|null;relatedStudents:StudentOptionApi[];legacyContextAvailable:boolean;legacyContextKeys:string[]};
export type StudentIssueApi={id:string;title:string;summary:string;status:'active'|'needs_verification'|'resolved'|'recurred';
  firstOccurredAt?:string|null;lastOccurredAt?:string|null;revision:number;occurrenceCount:number;reviewSessionCount:number;
  messageMentionCount:number;latestSourceKind?:'teacher_confirmed'|'student_reported'|'staff_confirmed'|null;latestPracticeAction?:string|null;latestPracticeAt?:string|null};
export type StudentFactApi={id:string;kind:'preference'|'event'|'learning_note';content:string;sourceText?:string|null;sourceMessageId?:string|null;
  occurredAt?:string|null;expiresAt?:string|null;status?:'active'|'archived';useInSuggestions:number|boolean;createdAt:string};
export type StudentSummaryApi={pageId:string;studentId:string;studentName:string;revision:number;facts:StudentFactApi[];
  expiredFacts:StudentFactApi[];
  assignments:Array<{id:string;title:string;status:string;startedAt?:string|null;durationLabel:string;reviewSessionCount:number;
    revision:number;pendingSubmissionCount:number;lastReviewedAt?:string|null}>;submissions:Array<{id:string;sourceMessageId:string;submittedAt:string;status:string;assignmentTitle?:string|null}>;
  issues:StudentIssueApi[];unresolvedIssues:StudentIssueApi[];historyCoverage:{status:'unknown'|'partial'|'complete';lastSyncedAt?:string|null;
    oldestMessageAt?:string|null;linkedConversationCount:number;syncedConversationCount:number;errors:string[]}};
export type StudentProposalApi={id:string;kind:string;payload:Record<string,unknown>;sourceMessageId?:string|null;sourceText?:string|null;confidence?:number|null};
export type StudentIssueDetailApi={issue:StudentIssueApi;occurrences:Array<{id:string;occurredAt:string;sourceKind:string;revision:number;approved:number}>;
  evidence:Array<{id:string;speaker:string;verbatimText:string;occurredAt:string;conversationId?:string|null;messageId?:string|null}>;
  practiceActions:Array<{id:string;content:string;createdAt:string}>};

export type StudentContextApi = {
  pageId: string;
  studentId: string;
  studentName: string;
  revision: number;
  updatedAt: string | null;
  profile: {
    recipientCall: string;
    senderCall: string;
    nextAction: string;
    specialNotes: string;
    studyNotes: string;
    dataStatus: 'saved' | 'ai_suggested' | 'unclear' | 'conflict';
    fields: Array<{ key: string; label: string; value: string; source: string; evidence?: string }>;
    customFields: Array<{
      id: string;
      name: string;
      type: 'text' | 'number' | 'select';
      value: string;
      options?: string[];
      useInSuggestions: boolean;
      hidden?: boolean;
    }>;
  };
  memories: Array<{
    id: string;
    content: string;
    status: 'active' | 'ai_suggested' | 'review_due' | 'expired' | 'archived';
    reason?: string;
    createdAt: string;
  }>;
};

export type ConversationSummaryApi = {
  id: string;
  pageId: string;
  customerId?: string;
  customerName: string;
  lastMessage?: string;
  updatedAt?: string;
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

export async function resolveConversationByContext(
  pageId: string,
  input: { studentName?: string | null; latestMessage?: string | null },
) {
  const search = new URLSearchParams({ pageIds: pageId, limit: '50' });
  const data = await requestJson<{ items: ConversationSummaryApi[] }>(
    `/api/conversations?${search.toString()}`
  );
  const target = normalizeText(input.studentName || '');
  if (target) {
    const exact = data.items.filter((item) => normalizeText(item.customerName) === target);
    if (exact.length) return exact[0];
    const close = data.items.filter((item) => {
      const candidate = normalizeText(item.customerName);
      return target.length >= 3 && candidate.length >= 3 &&
        (candidate.includes(target) || target.includes(candidate));
    });
    if (close.length === 1) return close[0];
  }
  const latest = normalizeText(input.latestMessage || '');
  if (latest.length >= 4) {
    const messageMatches = data.items.filter((item) => {
      const candidate = normalizeText(item.lastMessage || '');
      return candidate.length >= 4 &&
        (candidate === latest || candidate.includes(latest) || latest.includes(candidate));
    });
    if (messageMatches.length === 1) return messageMatches[0];
  }
  return null;
}

function normalizeText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
}

export async function createSuggestions(input: {
  conversationId: string;
  studentId?:string;
  contextRevision?:number;
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

export async function createTeacherReview(input: {
  conversationId: string;
  teacherInput: string;
  pronouns: { speaker: string; listener: string };
  messages: ApiChatMessage[];
  studentId?:string;
  contextRevision?:number;
  assignmentId?:string;
  assignmentTitle?:string;
  reviewSessionKey?:string;
}) {
  return requestJson<SuggestionApiResult>('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: input.conversationId,
      studentId:input.studentId,
      contextRevision:input.contextRevision,
      mode: 'teacher_review',
      teacherInput: input.teacherInput,
      assignmentId:input.assignmentId,
      assignmentTitle:input.assignmentTitle,
      reviewSessionKey:input.reviewSessionKey,
      pronouns: {
        senderCall: input.pronouns.speaker,
        recipientCall: input.pronouns.listener,
        label: `${input.pronouns.speaker} — ${input.pronouns.listener}`
      },
      messages: input.messages
    })
  });
}

export async function getConversationStudentLink(conversationId:string,pageId:string,signal?:AbortSignal) {
  const query=new URLSearchParams({pageId});
  return requestJson<{identity:StudentIdentityApi;students:StudentOptionApi[]}>(
    `/api/conversations/${encodeURIComponent(conversationId)}/student-link?${query.toString()}`,{signal});
}

export async function linkStudentToConversation(input:{conversationId:string;pageId:string;studentId?:string;newStudentName?:string;importLegacyContext?:boolean}) {
  return requestJson<{identity:StudentIdentityApi;students:StudentOptionApi[]}>(`/api/conversations/${encodeURIComponent(input.conversationId)}/student-link`,{
    method:'POST',body:JSON.stringify(input)});
}

export type ConversationMessageStudentLinkApi={messageId:string;studentId:string;studentName:string};
export async function getConversationMessageStudents(conversationId:string,pageId:string,signal?:AbortSignal) {
  const query=new URLSearchParams({pageId});
  return requestJson<{items:ConversationMessageStudentLinkApi[]}>(`/api/conversations/${encodeURIComponent(conversationId)}/student-messages?${query}`,{signal});
}
export async function linkConversationMessages(input:{conversationId:string;pageId:string;studentId:string;messageIds:string[];reassign?:boolean}) {
  return requestJson<ConversationMessageStudentLinkApi[]>(`/api/conversations/${encodeURIComponent(input.conversationId)}/student-messages/link`,{
    method:'POST',body:JSON.stringify(input)});
}

export async function getStudentSummary(studentId:string,signal?:AbortSignal) {
  return requestJson<StudentSummaryApi>(`/api/students/${encodeURIComponent(studentId)}/summary`,{signal});
}

export async function createStudentFact(input:{studentId:string;kind:StudentFactApi['kind'];content:string;useInSuggestions:boolean;expiresAt?:string;
  sourceText?:string;sourceMessageId?:string;sourceConversationId?:string}) {
  return requestJson<{items:StudentFactApi[]}>(`/api/students/${encodeURIComponent(input.studentId)}/facts`,{method:'POST',body:JSON.stringify(input)});
}

export async function updateStudentFact(input:{studentId:string;factId:string;status?:'active'|'archived';content?:string;expiresAt?:string|null;useInSuggestions?:boolean}) {
  return requestJson<{items:StudentFactApi[]}>(`/api/students/${encodeURIComponent(input.studentId)}/facts/${encodeURIComponent(input.factId)}`,
    {method:'PATCH',body:JSON.stringify(input)});
}

export async function createStudentAssignment(input:{studentId:string;title:string;startedAt?:string;startedSource?:string}) {
  return requestJson<{items:StudentSummaryApi['assignments']}>(`/api/students/${encodeURIComponent(input.studentId)}/assignments`,{method:'POST',body:JSON.stringify(input)});
}

export async function updateStudentAssignment(input:{studentId:string;assignmentId:string;revision:number;status:'active'|'completed'|'unknown';completionEvidence?:string}) {
  return requestJson<{items:StudentSummaryApi['assignments']}>(`/api/students/${encodeURIComponent(input.studentId)}/assignments/${encodeURIComponent(input.assignmentId)}`,
    {method:'PATCH',body:JSON.stringify(input)});
}

export async function createIssueOccurrence(input:{studentId:string;title:string;summary?:string;occurredAt:string;sourceKind:'teacher_confirmed'|'student_reported'|'staff_confirmed';
  conversationId?:string;messageId?:string;speaker:string;verbatimText:string;practiceAction?:string}) {
  return requestJson<{issues:StudentIssueApi[]}>(`/api/students/${encodeURIComponent(input.studentId)}/issues/occurrences`,{method:'POST',body:JSON.stringify(input)});
}

export async function getStudentIssueDetail(studentId:string,issueId:string) {
  return requestJson<StudentIssueDetailApi>(`/api/students/${encodeURIComponent(studentId)}/issues/${encodeURIComponent(issueId)}`);
}

export async function updateStudentOccurrence(input:{studentId:string;issueId:string;occurrenceId:string;revision:number;approved?:boolean;
  targetIssueId?:string;targetIssueTitle?:string;occurredAt?:string;sourceKind?:'teacher_confirmed'|'student_reported'|'staff_confirmed';
  evidenceText?:string;evidenceConversationId?:string;evidenceMessageId?:string;speaker?:string}) {
  return requestJson<StudentIssueDetailApi>(`/api/students/${encodeURIComponent(input.studentId)}/issues/${encodeURIComponent(input.issueId)}/occurrences/${encodeURIComponent(input.occurrenceId)}`,
    {method:'PATCH',body:JSON.stringify(input)});
}

export async function updateStudentIssue(input:{studentId:string;issueId:string;revision:number;status:'active'|'needs_verification'|'resolved'|'recurred';statusEvidence:string}) {
  return requestJson<{items:StudentIssueApi[]}>(`/api/students/${encodeURIComponent(input.studentId)}/issues/${encodeURIComponent(input.issueId)}`,
    {method:'PATCH',body:JSON.stringify(input)});
}

export async function getStudentIssues(studentId:string,offset=0,limit=100) {
  return requestJson<{items:StudentIssueApi[];limit:number;offset:number}>(
    `/api/students/${encodeURIComponent(studentId)}/issues?view=all&limit=${limit}&offset=${offset}`);
}

export async function recordStudentSubmission(input:{studentId:string;conversationId:string;messageId:string;assignmentTitle?:string}) {
  return requestJson<{items:StudentSummaryApi['submissions']}>(`/api/students/${encodeURIComponent(input.studentId)}/submissions`,{method:'POST',body:JSON.stringify(input)});
}

export async function listStudentProposals(studentId:string) {
  return requestJson<{items:StudentProposalApi[]}>(`/api/students/${encodeURIComponent(studentId)}/proposals?status=pending`);
}

export async function extractStudentProposals(input:{studentId:string;conversationId:string}) {
  return requestJson<{items:StudentProposalApi[];createdCount:number;sourceMessageCount:number;hasMore:boolean}>(
    `/api/students/${encodeURIComponent(input.studentId)}/proposals/extract`,{method:'POST',body:JSON.stringify({conversationId:input.conversationId})});
}

export async function decideStudentProposal(input:{studentId:string;proposalId:string;action:'accept'|'reject'}) {
  return requestJson<{items:StudentProposalApi[]}>(`/api/students/${encodeURIComponent(input.studentId)}/proposals/${encodeURIComponent(input.proposalId)}/decision`,
    {method:'POST',body:JSON.stringify(input)});
}

export async function syncConversationHistory(input:{conversationId:string;pageId:string;pages?:number}) {
  return requestJson<{syncedMessages:number;complete:boolean;stopped:boolean;coverage:StudentSummaryApi['historyCoverage']}>(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/history/sync`,{method:'POST',body:JSON.stringify({pageId:input.pageId,pages:input.pages||1,limit:50})});
}

export async function confirmReviewSession(input:{studentId:string;reviewSessionId:string;confirmed:boolean;evidence?:string}) {
  return requestJson<{items:Array<{id:string;status:string}>}>(`/api/students/${encodeURIComponent(input.studentId)}/review-sessions/${encodeURIComponent(input.reviewSessionId)}/confirmation`,
    {method:'PATCH',body:JSON.stringify(input)});
}

export async function getStudentContext(input: {
  pageId: string;
  studentId: string;
  studentName: string;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({ pageId: input.pageId, studentName: input.studentName });
  return requestJson<StudentContextApi>(
    `/api/students/${encodeURIComponent(input.studentId)}/context?${query.toString()}`,
    { signal: input.signal }
  );
}

export async function saveStudentProfile(input: {
  context: StudentContextApi;
  profile: StudentContextApi['profile'];
}) {
  const { customFields: _customFields, ...profile } = input.profile;
  return requestJson<StudentContextApi>(
    `/api/students/${encodeURIComponent(input.context.studentId)}/profile`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        pageId: input.context.pageId,
        studentName: input.context.studentName,
        revision: input.context.revision,
        profile
      })
    }
  );
}

export async function createStudentMemory(input: {
  context: StudentContextApi;
  content: string;
  reason?: string;
}) {
  return requestJson<StudentContextApi>(
    `/api/students/${encodeURIComponent(input.context.studentId)}/memories`,
    {
      method: 'POST',
      body: JSON.stringify({
        pageId: input.context.pageId,
        studentName: input.context.studentName,
        revision: input.context.revision,
        content: input.content,
        reason: input.reason
      })
    }
  );
}

export async function updateStudentCustomField(input: {
  context: StudentContextApi;
  fieldId: string;
  value: string;
}) {
  return requestJson<StudentContextApi>(
    `/api/students/${encodeURIComponent(input.context.studentId)}/custom-fields/${encodeURIComponent(input.fieldId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        pageId: input.context.pageId,
        studentName: input.context.studentName,
        revision: input.context.revision,
        value: input.value
      })
    }
  );
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiBaseUrl = API_BASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:4000' : '');
  if (!apiBaseUrl && location.protocol === 'chrome-extension:') {
    throw new ApiError(
      'Widget chưa được build với VITE_API_BASE_URL.',
      0,
      'API_BASE_URL_MISSING'
    );
  }
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    ...(init.headers as Record<string, string> | undefined),
  };
  delete headers['X-Skip-Auth'];

  const skipAuth = path.startsWith('/api/auth/login') || path.startsWith('/api/health');
  const sessionToken = getSessionToken();
  if (!skipAuth && sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : '';
    const message =
      typeof payload.error === 'string' ? payload.error : `API error ${response.status}`;
    if (response.status === 401 || code === 'AUTH_REQUIRED' || code === 'SESSION_EXPIRED') {
      clearAppSession();
      window.dispatchEvent(new Event('ttd:session-expired'));
    }
    throw new ApiError(
      message,
      response.status,
      code || `HTTP_${response.status}`,
      typeof payload.requestId === 'string'
        ? payload.requestId
        : response.headers.get('X-Request-Id') || requestId
    );
  }
  return payload as T;
}
