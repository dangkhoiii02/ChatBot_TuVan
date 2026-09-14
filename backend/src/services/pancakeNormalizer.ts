import type {
  ChatMessage,
  ConversationSummary,
  MessageAttachment,
  MessageSender,
  PageSummary
} from '../types/api.js';

type ConversationPageContext = {
  id: string;
  name?: string;
};

export function normalizePage(raw: unknown): PageSummary {
  const item = asRecord(raw);
  const picture = asRecord(firstDefined(item.picture, item.avatar, item.image));

  return {
    id: stringValue(firstDefined(item.id, item.page_id, item.pageId), 'unknown-page'),
    name: stringValue(firstDefined(item.name, item.page_name, item.pageName, item.title), 'Pancake page'),
    platform: optionalString(item.platform),
    avatarUrl: optionalString(firstDefined(item.avatar_url, item.avatar, item.image_url, picture.url)),
    source: 'pancake'
  };
}

export function normalizeConversation(raw: unknown, page?: ConversationPageContext): ConversationSummary {
  const item = asRecord(raw);
  const customer = asRecord(firstDefined(item.customer, item.user, item.from, item.customer_info));
  const lastMessageRaw = firstDefined(item.last_message, item.lastMessage, item.snippet, item.preview);
  const pageId = stringValue(firstDefined(page?.id, item.page_id, item.pageId), 'unknown-page');
  const lastMessage = getText(lastMessageRaw);

  return {
    pageId,
    pageName: page?.name,
    id: stringValue(firstDefined(item.id, item.conversation_id), 'unknown-conversation'),
    customerId: optionalString(firstDefined(item.customer_id, customer.id, customer.customer_id)),
    customerName: stringValue(
      firstDefined(item.customer_name, item.name, customer.name, customer.full_name),
      'Khach hang'
    ),
    avatarUrl: optionalString(firstDefined(item.avatar, item.avatar_url, customer.avatar, customer.avatar_url)),
    lastMessage,
    updatedAt: stringValue(firstDefined(item.updated_at, item.last_sent_at, item.inserted_at), new Date(0).toISOString()),
    unreadCount: numberValue(firstDefined(item.unread_count, item.unreadCount), 0),
    source: 'pancake'
  };
}

export function normalizeMessage(raw: unknown, conversationId: string): ChatMessage {
  const item = asRecord(raw);
  const senderRaw = firstDefined(item.sender, item.from, item.user, item.customer);
  const sender = normalizeSender(item, senderRaw);
  const senderRecord = asRecord(senderRaw);

  return {
    id: stringValue(firstDefined(item.id, item.message_id), `msg-${Date.now()}`),
    conversationId,
    sender,
    senderName: optionalString(
      firstDefined(item.sender_name, item.from_name, senderRecord.name, senderRecord.full_name)
    ),
    text: getText(firstDefined(item.text, item.message, item.content, item.body)),
    attachments: normalizeAttachments(firstDefined(item.attachments, item.files, item.medias)),
    createdAt: stringValue(firstDefined(item.created_at, item.inserted_at, item.sent_at), new Date(0).toISOString())
  };
}

function normalizeSender(message: Record<string, unknown>, senderRaw: unknown): MessageSender {
  const senderRecord = asRecord(senderRaw);
  const rawType = String(
    firstDefined(message.sender_type, message.from_type, message.type, senderRecord.type, '')
  ).toLowerCase();

  if (rawType.includes('page') || rawType.includes('staff') || rawType.includes('admin')) {
    return 'staff';
  }

  if (rawType.includes('system')) {
    return 'system';
  }

  const isFromPage = firstDefined(message.is_from_page, message.from_page, senderRecord.is_page);
  if (isFromPage === true || isFromPage === 'true') {
    return 'staff';
  }

  return 'student';
}

function normalizeAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((attachment) => {
    const item = asRecord(attachment);
    const rawType = String(firstDefined(item.type, item.mime_type, item.content_type, '')).toLowerCase();
    return {
      type: normalizeAttachmentType(rawType),
      url: optionalString(firstDefined(item.url, item.src, item.file_url)),
      name: optionalString(firstDefined(item.name, item.file_name, item.filename))
    };
  });
}

function normalizeAttachmentType(rawType: string): MessageAttachment['type'] {
  if (rawType.includes('image')) return 'image';
  if (rawType.includes('video')) return 'video';
  if (rawType.includes('audio')) return 'audio';
  if (rawType.includes('file') || rawType.includes('pdf')) return 'file';
  return 'unknown';
}

function getText(raw: unknown): string {
  if (typeof raw === 'string') return sanitizePancakeText(raw);
  const record = asRecord(raw);
  return sanitizePancakeText(stringValue(firstDefined(record.text, record.message, record.content, record.body), ''));
}

function sanitizePancakeText(value: string) {
  if (!value.trim()) return '';

  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (match, entity) => {
      const entities: Record<string, string> = {
        nbsp: ' ',
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'"
      };
      return entities[String(entity).toLowerCase()] || match;
    });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
