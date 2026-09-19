import { randomUUID } from 'node:crypto';
import { resolveAI } from '../../../shared/ai-provider.cjs';
import type { ChatMessage, SuggestionResult } from '../types/api.js';
import { getDatabase } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';
import { createAISuggestions } from './aiSuggestionProvider.js';

export type CreateSuggestionsInput = {
  conversationId: string;
  studentId?: string;
  contextRevision?: number;
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

export async function createSuggestions(input: CreateSuggestionsInput): Promise<SuggestionResult> {
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

  try {
    const db = getDatabase();
    const kvRow = db
      .prepare('SELECT id FROM knowledge_versions ORDER BY created_at DESC LIMIT 1')
      .get() as { id: string } | undefined;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO generations (
        id, conversation_id, input_text, context_json, knowledge_version_id, model, status, sensitivity, flag_reason, replies_json, latency_ms, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `gen-${randomUUID()}`,
      input.conversationId,
      input.mode === 'teacher_review' ? input.teacherInput || '' : pendingStudentText,
      JSON.stringify({
        mode: input.mode || 'chat',
        messageCount: input.messages.length,
        studentId: input.studentId,
        contextRevision: input.contextRevision
      }),
      kvRow?.id || 'v_default',
      result.provider || `${settings.provider} (${settings.model})`,
      'succeeded',
      result.sensitivity,
      result.flagReason || null,
      JSON.stringify(result.suggestions),
      Date.now() - startTime,
      nowIso,
      nowIso
    );
  } catch (error) {
    console.warn('Could not record generation audit to SQLite:', error);
  }

  return result;
}
