import { randomUUID } from 'node:crypto';
import { resolveAI } from '../../../shared/ai-provider.cjs';
import type { ChatMessage, SuggestionResult } from '../types/api.js';
import { getDatabase } from '../db/index.js';
import { withTransaction } from '../db/transaction.js';
import { HttpError } from '../utils/httpError.js';
import { createAISuggestions } from './aiSuggestionProvider.js';
import { formatStudentContext } from './promptStudentContext.js';

export type CreateSuggestionsInput = {
  conversationId: string;
  studentId?: string;
  contextRevision?: number;
  assignmentId?: string;
  assignmentTitle?: string;
  reviewSessionId?: string;
  reviewSessionKey?: string;
  sourceMessageId?: string;
  studentContext?: {
    studentId: string;
    studentName: string;
    revision: number;
    facts: Array<{ id: string; kind: string; content: string; sourceText?: string; sourceMessageId?: string; occurredAt?: string; expiresAt?: string }>;
    issueReferences: Array<{ id: string; title: string; status: string; lastOccurredAt?: string; latestPracticeAction?: string }>;
    historyCoverage: { status: string; oldestMessageAt?: string | null; lastSyncedAt?: string | null };
  };
  mode?: 'chat' | 'teacher_review';
  teacherInput?: string;
  pronouns?: {
    senderCall: string;
    recipientCall: string;
    label?: string;
  };
  messages: Array<Pick<ChatMessage, 'sender' | 'text' | 'createdAt'>>;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

export async function createSuggestions(input: CreateSuggestionsInput, options?: {
  afterProviderSuccess?: () => { reviewSessionId?: string } | void;
}): Promise<SuggestionResult> {
  const startTime = Date.now();
  const pendingStudentText = input.messages
    .filter((message) => message.sender === 'student' && message.text.trim())
    .map((message) => message.text.trim())
    .join('\n');
  const settings = resolveAI(input);

  if (settings.provider === 'mock') {
    throw new HttpError(
      503,
      'Máy chủ chưa có cấu hình AI thật. Hãy cấu hình server hoặc dùng provider/key/model riêng.',
      'AI_NOT_CONFIGURED'
    );
  }

  let result: SuggestionResult;
  try {
    result = await createAISuggestions({ ...input, ...settings });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Lỗi không xác định';
    console.error('AI provider request failed:', reason);
    throw new HttpError(
      502,
      `Nhà cung cấp AI không trả về kết quả hợp lệ: ${reason}`,
      'AI_PROVIDER_FAILED'
    );
  }

  // Commit learning records only after the provider has returned successfully.
  // The callback also supplies the resulting ID to the generation audit row.
  const promptFacts=formatStudentContext(input.studentContext,input.mode==='teacher_review').facts;

  try {
    const db = getDatabase();
    withTransaction(db,()=>{
      const auditInput={...input,...(options?.afterProviderSuccess?.()||{})};
      const kvRow = db.prepare('SELECT id FROM knowledge_versions ORDER BY created_at DESC LIMIT 1')
        .get() as { id: string } | undefined;
      const nowIso = new Date().toISOString();
      db.prepare(`INSERT INTO generations (
        id, conversation_id, input_text, context_json, knowledge_version_id, model, status, sensitivity, flag_reason, replies_json, latency_ms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(`gen-${randomUUID()}`,input.conversationId,input.mode === 'teacher_review' ? input.teacherInput || '' : pendingStudentText,
          JSON.stringify({
            mode: input.mode || 'chat',messageCount: input.messages.length,studentId: input.studentContext?.studentId,
            contextRevision: input.studentContext?.revision,
            contextVersion: input.studentContext ? `${input.studentContext.studentId}:${input.studentContext.revision}` : null,
            usedFactIds: promptFacts.map((fact) => fact.id),
            referencedIssueIds: input.studentContext?.issueReferences.map((issue) => issue.id) || [],
            historyCoverage: input.studentContext?.historyCoverage || { status: 'unknown' },
            assignmentId: input.assignmentId || null,reviewSessionId: auditInput.reviewSessionId || null,
            reviewSessionKey: auditInput.reviewSessionKey || null
          }),kvRow?.id || 'v_default',result.provider || `${settings.provider} (${settings.model})`,'succeeded',
          result.sensitivity,result.flagReason || null,JSON.stringify(result.suggestions),Date.now() - startTime,nowIso,nowIso);
    });
  } catch (error) {
    if(error instanceof HttpError) throw error;
    console.error('Could not persist suggestion transaction:',error);
    throw new HttpError(500,'Không thể lưu kết quả gợi ý. Các thay đổi liên quan đã được hoàn tác.','SUGGESTION_PERSISTENCE_FAILED');
  }

  return result;
}
