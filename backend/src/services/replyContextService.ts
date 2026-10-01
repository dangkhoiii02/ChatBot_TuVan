import type { ChatMessage } from '../types/api.js';
import { listCachedMessagesForStudent } from './studentIdentityService.js';

type ContextMessage = Pick<ChatMessage, 'sender' | 'text' | 'createdAt'> &
  Partial<Pick<ChatMessage, 'id' | 'conversationId' | 'senderName'>> & {
    attachments?: unknown[];
  };

type ResolveReplyContextInput = {
  conversationId: string;
  pageId?: string;
  studentId?: string;
  messages: ContextMessage[];
};

/**
 * Uses Pancake as the authoritative source when available, then keeps the
 * latest student turn with adjacent staff replies. This preserves bursts such as
 * "thầy ơi" / "em cần hỏi" / the actual question instead of retaining only
 * the final line.
 */
export async function resolveReplyContext(input: ResolveReplyContextInput): Promise<ContextMessage[]> {
  let messages = input.messages;
  if (input.pageId) {
    const rows=input.studentId?listCachedMessagesForStudent(input.pageId,input.conversationId,input.studentId,100):[];
    if(rows.length) {
      const liveById = new Map(input.messages.filter((message) => message.id).map((message) => [message.id, message]));
      const cached=rows.map((row)=>({
        id:row.id,conversationId:row.conversationId,
        sender:liveById.get(row.id)?.sender || row.sender as 'student'|'staff'|'system',
        senderName:row.senderName||undefined,text:row.text,
        attachments:parseAttachments(row.attachmentsJson),createdAt:row.createdAt
      }));
      if (cached.some((message) => message.sender === 'student')) messages=cached;
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

  // Include replies after the last student message so AI sees what staff has
  // already said when asked for a follow-up suggestion.
  return ordered.slice(Math.max(latestStaffIndex, 0));
}

function parseAttachments(raw:string|null) {
  if(!raw) return [];
  try { const value=JSON.parse(raw) as unknown; return Array.isArray(value)?value:[]; }
  catch { return []; }
}

function getTime(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
