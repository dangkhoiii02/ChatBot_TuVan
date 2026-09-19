import { config } from '../config.js';
import type { ChatMessage } from '../types/api.js';
import { pancakeClient, hasPancakePageAccess } from './pancakeClient.js';
import { normalizeMessage } from './pancakeNormalizer.js';

type ContextMessage = Pick<ChatMessage, 'sender' | 'text' | 'createdAt'> &
  Partial<Pick<ChatMessage, 'id' | 'conversationId' | 'senderName'>> & {
    attachments?: unknown[];
  };

type ResolveReplyContextInput = {
  conversationId: string;
  pageId?: string;
  messages: ContextMessage[];
};

/**
 * Uses Pancake as the authoritative source when available, then keeps the
 * latest unanswered turn: the last staff reply plus every following student
 * message through the newest received message. This preserves bursts such as
 * "thầy ơi" / "em cần hỏi" / the actual question instead of retaining only
 * the final line.
 */
export async function resolveReplyContext(input: ResolveReplyContextInput): Promise<ContextMessage[]> {
  let messages = input.messages;

  if (hasPancakePageAccess(input.pageId)) {
    try {
      const raw = await pancakeClient.listMessages({
        pageId: input.pageId,
        conversationId: input.conversationId,
        limit: Math.max(config.pancake.messageLimit, 50)
      });
      const pancakeMessages = extractItems(raw).map((item) => normalizeMessage(item, input.conversationId));
      if (pancakeMessages.length) messages = pancakeMessages;
    } catch (error) {
      // The client payload remains a safe operational fallback, but the same
      // server-side selection rule is still applied below.
      console.warn(`Could not refresh reply context from Pancake for ${input.conversationId}:`, error);
    }
  }

  return selectLatestUnansweredTurn(messages);
}

export function selectLatestUnansweredTurn(messages: ContextMessage[]): ContextMessage[] {
  const ordered = messages
    .filter((message) => message.sender !== 'system' && (message.text.trim() || message.attachments?.length))
    .sort((left, right) => getTime(left.createdAt) - getTime(right.createdAt));

  let latestStudentIndex = -1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index]?.sender === 'student') {
      latestStudentIndex = index;
      break;
    }
  }
  if (latestStudentIndex < 0) return [];

  let latestStaffIndex = -1;
  for (let index = latestStudentIndex - 1; index >= 0; index -= 1) {
    if (ordered[index]?.sender === 'staff') {
      latestStaffIndex = index;
      break;
    }
  }

  // A newer staff message means the latest student turn was already answered.
  const hasNewerStaffReply = ordered
    .slice(latestStudentIndex + 1)
    .some((message) => message.sender === 'staff');
  if (hasNewerStaffReply) return [];

  return ordered.slice(Math.max(latestStaffIndex, 0), latestStudentIndex + 1);
}

function extractItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  const candidate = [record.messages, record.data, record.items].find(Array.isArray);
  return candidate || [];
}

function getTime(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
