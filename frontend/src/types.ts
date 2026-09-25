export type ConversationIntent = 'check_in' | 'assignment_feedback' | 'sensitive' | 'unknown';

export type PronounPair = {
  recipientCall: string; // "Gọi người nhận" (vd: Chị, Em, Anh, Bạn)
  senderCall: string;    // "Người gửi xưng" (vd: Em, Thầy, Mình)
  label: string;         // vd: "Thầy — Em", "Em — Chị"
};

export type SourceOrigin = 'user_input' | 'ai_suggested' | 'confirmed' | 'empty' | 'conflict';

export type ProfileField = {
  key: string;
  label: string;
  value: string;
  source: SourceOrigin;
  aiSuggestion?: string;
  conflictReason?: string;
  evidence?: string;
};

export type CustomField = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select';
  fillMode: 'manual' | 'ai_extract' | 'ai_evaluate';
  useInSuggestions: boolean;
  value: string;
  source: SourceOrigin;
  options?: string[];
  evidence?: string;
  hidden?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type StudentProfile = {
  recipientCall: string;
  senderCall: string;
  nextAction: string;
  specialNotes: string;
  studyNotes: string;
  fields: ProfileField[];
  customFields: CustomField[];
  dataStatus: 'saved' | 'ai_suggested' | 'unclear' | 'conflict';
};

export type AssignmentReviewOption = {
  id: string;
  tone: string;
  content: string;
  usedFacts?: string[];
  reviewSessionId?: string;
};

export type StudentOption = { id: string; name: string; revision?: number; updatedAt?: string };
export type StudentIdentity = {
  pageId: string;
  conversationId: string;
  customerId?: string | null;
  customerName: string;
  status: 'linked' | 'needs_selection';
  student: StudentOption | null;
  relatedStudents: StudentOption[];
  legacyContextAvailable: boolean;
  legacyContextKeys: string[];
};
export type StudentIssue = {
  id: string; title: string; summary: string; status: 'active' | 'needs_verification' | 'resolved' | 'recurred';
  firstOccurredAt?: string | null; lastOccurredAt?: string | null; resolvedAt?: string | null; revision: number;
  occurrenceCount: number; reviewSessionCount: number; messageMentionCount: number; latestSourceKind?: string;
  latestPracticeAction?: string | null; latestPracticeAt?: string | null;
};
export type StudentFact = {
  id: string; kind: 'preference' | 'event' | 'learning_note'; content: string; sourceText?: string | null;
  sourceMessageId?: string | null; sourceConversationId?: string | null; occurredAt?: string | null; expiresAt?: string | null;
  status?: 'active' | 'archived'; useInSuggestions: number | boolean; createdAt: string; updatedAt?: string;
};
export type StudentSummary = {
  pageId: string; studentId: string; studentName: string; revision: number; facts: StudentFact[]; expiredFacts:StudentFact[];
  assignments: Array<{id:string;title:string;status:string;revision:number;startedAt?:string|null;daysStuck?:number|null;durationLabel:string;
    reviewSessionCount:number;pendingSubmissionCount:number;unconfirmedReviewCount:number;lastReviewedAt?:string|null;lastSubmittedAt?:string|null}>;
  submissions: Array<{id:string;assignmentId?:string|null;assignmentTitle?:string|null;conversationId:string;sourceMessageId:string;submittedAt:string;status:string}>;
  issues: StudentIssue[]; unresolvedIssues: StudentIssue[];
  historyCoverage: {status:'unknown'|'partial'|'complete';lastSyncedAt?:string|null;oldestMessageAt?:string|null;newestMessageAt?:string|null;
    linkedConversationCount:number;syncedConversationCount:number;errors:string[]};
};
export type IssueDetail = {
  issue: StudentIssue; occurrences: Array<{id:string;assignmentId?:string|null;assignmentTitle?:string|null;reviewSessionId?:string|null;
    occurredAt:string;sourceKind:string;approved:number;revision:number;evidenceCount:number}>;
  evidence: Array<{id:string;occurrenceId:string;conversationId?:string|null;messageId?:string|null;reviewSessionId?:string|null;
    speaker:string;verbatimText:string;occurredAt:string;teacherInput?:string|null}>;
  practiceActions: Array<{id:string;content:string;reviewSessionId?:string|null;sourceMessageId?:string|null;createdBy:string;createdAt:string}>;
};
export type StudentProposal = {id:string;kind:string;payload:Record<string,unknown>;sourceMessageId?:string|null;sourceText?:string|null;
  sourceConversationId?:string|null;confidence?:number|null;status:string;createdAt:string};

export type MemoryItem = {
  id: string;
  content: string;
  status: 'active' | 'ai_suggested' | 'review_due' | 'expired' | 'archived' | 'history';
  reason?: string;
  reviewAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type PancakePage = {
  id: string;
  name: string;
  platform?: string;
  avatarUrl?: string;
};

export type MessageAttachment = {
  type: 'image' | 'video' | 'audio' | 'file' | 'unknown';
  url?: string;
  name?: string;
};

export type ChatMessage = {
  id: string;
  sender: 'student' | 'staff' | 'system';
  senderName?: string;
  text: string;
  sentAt: string;
  createdAt?: string;
  attachments?: MessageAttachment[];
};

export type Suggestion = {
  id: string;
  tone: string;
  content: string;
  sensitivity?: 'xanh' | 'vang' | 'do';
  usedFacts?: string[];
};

export type Conversation = {
  id: string;
  pageId: string;
  pageName?: string;
  studentId?: string;
  studentName: string;
  avatar?: string;
  lastMessage: string;
  lastActiveAt: string;
  intent: ConversationIntent;
  unreadCount: number;
  messages: ChatMessage[];
  suggestions: Suggestion[];
  flagReason?: string;
  aiAnalysis?: string;
  aiProvider?: string;
  isDemoFallback?: boolean;
  profile?: StudentProfile;
  memories?: MemoryItem[];
  assignmentOptions?: AssignmentReviewOption[];
  contextRevision?: number;
  contextUpdatedAt?: string | null;
  studentRevision?: number;
};

export type StudentContext = {
  pageId: string;
  studentId: string;
  studentName: string;
  profile: StudentProfile;
  memories: MemoryItem[];
  revision: number;
  updatedAt: string | null;
};

export type BackendHealth = {
  ok: boolean;
  service: string;
  pancakeConfigured: boolean;
  pancakeAuthMode: 'page_access_token' | 'access_token' | 'missing';
  aiProvider: string;
};

export type BackendPageSummary = {
  id: string;
  name: string;
  platform?: string;
  avatarUrl?: string;
  source: 'pancake';
};

export type BackendConversationSummary = {
  pageId: string;
  pageName?: string;
  id: string;
  customerId?: string;
  customerName: string;
  avatarUrl?: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
  source: 'pancake';
  studentIdentity?: StudentIdentity;
};

export type BackendChatMessage = {
  id: string;
  conversationId: string;
  sender: 'student' | 'staff' | 'system';
  senderName?: string;
  text: string;
  attachments: MessageAttachment[];
  createdAt: string;
};

export type BackendSuggestionResult = {
  requestId?: string;
  intent: ConversationIntent;
  sensitivity: 'xanh' | 'vang' | 'do';
  flagReason?: string;
  analysis?: string;
  provider?: string;
  isDemoFallback?: boolean;
  redFlagTriggered?: boolean;
  identityStatus?: 'linked' | 'needs_selection';
  contextVersion?: string | null;
  usedFacts?: Array<{id:string;kind:string;content:string;sourceMessageId?:string;sourceText?:string}>;
  historyCoverage?: {status:string;oldestMessageAt?:string|null;lastSyncedAt?:string|null};
  reviewSessionId?: string | null;
  suggestions: Suggestion[];
};
