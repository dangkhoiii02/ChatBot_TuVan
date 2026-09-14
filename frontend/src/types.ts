export type ConversationIntent = 'check_in' | 'assignment_feedback' | 'sensitive' | 'unknown';

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
};

export type Conversation = {
  id: string;
  pageId: string;
  pageName?: string;
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
  intent: ConversationIntent;
  sensitivity: 'xanh' | 'vang' | 'do';
  flagReason?: string;
  analysis?: string;
  provider?: string;
  isDemoFallback?: boolean;
  redFlagTriggered?: boolean;
  suggestions: Suggestion[];
};

export type DemoReply = {
  id: string;
  conversationId: string;
  content: string;
  sourceSuggestionId?: string;
  createdAt: string;
};
