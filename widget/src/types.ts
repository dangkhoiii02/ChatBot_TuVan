export type IntentCategory =
  | 'Tâm sự'
  | 'Lịch học'
  | 'Chấm bài'
  | 'Học phí'
  | 'Tuyển sinh'
  | 'Kỹ thuật'
  | 'Khiếu nại'
  | 'Khác';

export type TabId = 'suggestions' | 'student' | 'grading';

/** speaker = người gửi xưng, listener = gọi người nhận */
export type PronounPair = { speaker: string; listener: string };

export interface Suggestion {
  id: string;
  label: string;
  category: IntentCategory;
  text: string; // displayed, after apply
  baseText: string; // canonical text in Thầy/Em form used as source for rewrite
}

export interface StudentProfile {
  id: string;
  initials: string;
  name: string;
  statusLabel: string;
  courseLabel: string;
  pronouns: string;
  channel: string;
  note: string;
  profileFields: { label: string; value: string }[];
  notes: string;
  memories: string[];
}

export interface ConversationContextState {
  conversationId: string | null;
  studentName?: string | null;
  pageId?: string | null;
  url?: string;
}
