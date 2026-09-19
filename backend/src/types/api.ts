export type PageSummary = {
  id: string;
  name: string;
  platform?: string;
  avatarUrl?: string;
  source: 'pancake';
};

export type ConversationSummary = {
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

export type MessageSender = 'student' | 'staff' | 'system';

export type ChatMessage = {
  id: string;
  conversationId: string;
  sender: MessageSender;
  senderName?: string;
  text: string;
  attachments: MessageAttachment[];
  createdAt: string;
};

export type MessageAttachment = {
  type: 'image' | 'video' | 'audio' | 'file' | 'unknown';
  url?: string;
  name?: string;
};

export type PronounPair = {
  senderCall: string;
  recipientCall: string;
  label?: string;
};

export type SuggestionMode = 'chat' | 'teacher_review';

export type SuggestionIntent = 'check_in' | 'assignment_feedback' | 'sensitive' | 'unknown';

export type SuggestionResult = {
  intent: SuggestionIntent;
  sensitivity: 'xanh' | 'vang' | 'do';
  flagReason?: string;
  analysis?: string;
  provider?: string;
  isDemoFallback?: boolean;
  redFlagTriggered?: boolean;
  suggestions: Array<{
    id: string;
    tone: string;
    content: string;
    usedFacts?: string[];
  }>;
};
