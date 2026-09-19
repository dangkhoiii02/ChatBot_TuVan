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
};

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
  suggestions: Suggestion[];
};
