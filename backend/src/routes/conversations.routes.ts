import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { hasPancakePageAccess, pancakeClient } from '../services/pancakeClient.js';
import { normalizeConversation, normalizeMessage } from '../services/pancakeNormalizer.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { getDatabase } from '../db/index.js';
import { ensureConversationProfile, getCachedMessage, getConversationForPage, getConversationIdentity, linkConversation, linkConversationMessages, listConversationMessageStudents, rememberConversations, rememberMessages } from '../services/studentIdentityService.js';
import { assessHistoryPagination, enqueueHistoryBackfill } from '../services/historyBackfillService.js';

export const conversationsRouter = Router();

const conversationsQuerySchema = z.object({
  pageIds: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  cursors: z.string().max(10000).optional()
});

const messagesQuerySchema = z.object({
  pageId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  before: z.string().optional()
});

conversationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = conversationsQuerySchema.parse(req.query);
    const limit = query.limit ?? config.pancake.conversationLimit;
    const pageIds = getPageIds(query.pageIds);
    assertPageAccess(req, pageIds);
    let cursors:Record<string,string|null>={};
    if(query.cursors) {
      try { cursors=z.record(z.string().max(200).nullable()).parse(JSON.parse(query.cursors)); }
      catch { throw new HttpError(400,'Mốc tải hội thoại không hợp lệ.','INVALID_CONVERSATION_CURSOR'); }
    }
    const nextCursors:Record<string,string|null>={};

    // If Pancake is configured and not purely demo-page, query Pancake
    if (pageIds.every((pageId) => hasPancakePageAccess(pageId))) {
      try {
        const results = await Promise.all(
          pageIds.map(async (pageId) => {
            if(query.cursors && Object.hasOwn(cursors,pageId) && cursors[pageId]===null) { nextCursors[pageId]=null; return []; }
            const raw = await pancakeClient.listConversations({
              pageId,
              limit,
              since: query.since,
              until: query.until,
              lastConversationId: cursors[pageId] || undefined
            });

            const items=extractItems(raw).map((item) => normalizeConversation(item, { id: pageId }));
            nextCursors[pageId]=items.length>=limit && items.at(-1)?.id!==cursors[pageId] ? items.at(-1)!.id : null;
            return items;
          })
        );
        const items = results
          .flat()
          .sort((left, right) => getTime(right.updatedAt) - getTime(left.updatedAt));
        rememberConversations(items);
        return res.json({ nextCursors,hasMore:Object.values(nextCursors).some(Boolean),items: items.map((item) => ({
          ...item,
          studentIdentity: getConversationIdentity(item.pageId, item.id)
        })) });
      } catch (err) {
        if (!config.allowDemoMode) {
          throw new HttpError(502, 'Không tải được hội thoại từ Pancake. Vui lòng thử lại.', 'PANCAKE_UNAVAILABLE');
        }
        console.warn('Pancake listConversations failed, demo fallback enabled:', err);
      }
    }

    if (!config.allowDemoMode) {
      throw new HttpError(503, 'Pancake chưa được cấu hình trên máy chủ.', 'PANCAKE_NOT_CONFIGURED');
    }

    // Fallback or demo mode: fetch from SQLite database
    const db = getDatabase();
    const rows=pageIds.flatMap(pageId=>{
      if(query.cursors && Object.hasOwn(cursors,pageId) && cursors[pageId]===null) {nextCursors[pageId]=null;return [];}
      const all=db.prepare(`SELECT id,page_id,page_name,customer_id,customer_name,avatar_url,last_message,updated_at,unread_count
        FROM conversations WHERE page_id=? ORDER BY updated_at DESC,id DESC`).all(pageId) as Array<{
          id:string;page_id:string;page_name:string|null;customer_id:string|null;customer_name:string;avatar_url:string|null;
          last_message:string;updated_at:string;unread_count:number}>;
      const index=cursors[pageId]?all.findIndex(row=>row.id===cursors[pageId])+1:0;
      const page=all.slice(index,index+limit);
      nextCursors[pageId]=index+limit<all.length?page.at(-1)?.id||null:null;
      return page;
    });

    const items = rows.map((row) => ({
      pageId: row.page_id,
      pageName: row.page_name || 'Lớp Nhạc Thầy Minh',
      id: row.id,
      customerId: row.customer_id || undefined,
      customerName: row.customer_name,
      avatarUrl: row.avatar_url || '',
      lastMessage: row.last_message,
      updatedAt: row.updated_at,
      unreadCount: row.unread_count,
      source: 'pancake' as const
    }));

    return res.json({nextCursors,hasMore:Object.values(nextCursors).some(Boolean),items: items.map((item) => ({
      ...item,
      studentIdentity: getConversationIdentity(item.pageId, item.id)
    })) });
  })
);

conversationsRouter.get('/:conversationId/student-link', asyncHandler(async (req, res) => {
  const conversationId = req.params.conversationId;
  const pageId = z.string().trim().min(1).max(200).parse(req.query.pageId);
  assertPageAccess(req, [pageId]);
  res.json({
    identity: getConversationIdentity(pageId, conversationId),
    students: getStudentOptions(pageId)
  });
}));

conversationsRouter.post('/:conversationId/student-profile', asyncHandler(async (req,res)=>{
  const {pageId}=z.object({pageId:z.string().trim().min(1).max(200)}).parse(req.body);
  assertPageAccess(req,[pageId]);
  const identity=ensureConversationProfile(pageId,req.params.conversationId,req.staffAuth?.userId||'staff');
  res.json({identity,students:getStudentOptions(pageId)});
}));

conversationsRouter.post('/:conversationId/student-link', asyncHandler(async (req, res) => {
  const body = z.object({
    pageId: z.string().trim().min(1).max(200),
    studentId: z.string().trim().min(1).max(200).optional(),
    newStudentName: z.string().trim().min(1).max(200).optional(),
    importLegacyContext: z.boolean().optional().default(false)
  }).refine((value) => Boolean(value.studentId || value.newStudentName), 'Chọn học viên hoặc nhập tên học viên mới.').parse(req.body);
  assertPageAccess(req, [body.pageId]);
  const identity = linkConversation({ ...body, conversationId: req.params.conversationId, staffId: req.staffAuth?.userId || 'staff' });
  if(hasPancakePageAccess(body.pageId)) enqueueHistoryBackfill(body.pageId,req.params.conversationId,1);
  res.json({ identity, students: getStudentOptions(body.pageId) });
}));

conversationsRouter.post('/:conversationId/student-messages/link', asyncHandler(async (req, res) => {
  const body = z.object({
    pageId: z.string().trim().min(1).max(200),
    studentId: z.string().trim().min(1).max(200),
    messageIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
    reassign: z.boolean().optional().default(false)
  }).parse(req.body);
  assertPageAccess(req, [body.pageId]);
  res.json(linkConversationMessages({ ...body, conversationId: req.params.conversationId, staffId: req.staffAuth?.userId || 'staff' }));
}));

conversationsRouter.get('/:conversationId/student-messages', asyncHandler(async (req,res)=>{
  const pageId=z.string().trim().min(1).max(200).parse(req.query.pageId);
  assertPageAccess(req,[pageId]);
  const messageIds=req.query.messageIds===undefined?undefined:z.array(z.string().trim().min(1).max(200)).max(100)
    .parse(z.string().max(20000).parse(req.query.messageIds).split(',').filter(Boolean));
  res.json({items:listConversationMessageStudents(pageId,req.params.conversationId,messageIds)});
}));

// Evidence remains readable even when its conversation is outside the latest
// Pancake list or the source message is older than the most recent page.
conversationsRouter.get('/:conversationId/source-context', asyncHandler(async (req,res)=>{
  const {pageId,messageId}=z.object({pageId:z.string().trim().min(1).max(200),messageId:z.string().trim().min(1).max(200)}).parse(req.query);
  assertPageAccess(req,[pageId]);
  const conversation=getConversationForPage(pageId,req.params.conversationId);
  const source=getCachedMessage(pageId,conversation.id,messageId);
  const db=getDatabase();
  const before=db.prepare(`SELECT message_id AS id,sender,sender_name AS senderName,text,attachments_json,created_at AS createdAt
    FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND created_at<=?
    ORDER BY created_at DESC,message_id DESC LIMIT 15`).all(pageId,conversation.id,source.createdAt);
  const after=db.prepare(`SELECT message_id AS id,sender,sender_name AS senderName,text,attachments_json,created_at AS createdAt
    FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND created_at>?
    ORDER BY created_at,message_id LIMIT 15`).all(pageId,conversation.id,source.createdAt);
  const rows=[...before,...after] as Array<{id:string;sender:string;senderName:string|null;text:string;attachments_json:string;createdAt:string}>;
  const items=rows.filter((item)=>item.id!==messageId).map(({attachments_json,...item})=>({...item,attachments:parseAttachments(attachments_json)}));
  const sourceAttachments=db.prepare('SELECT attachments_json FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?')
    .get(pageId,conversation.id,messageId) as {attachments_json:string};
  items.push({...source,id:messageId,senderName:source.senderName||null,attachments:parseAttachments(sourceAttachments.attachments_json)});
  items.sort((a,b)=>getTime(a.createdAt)-getTime(b.createdAt));
  const row=db.prepare('SELECT page_name,avatar_url,last_message,updated_at,unread_count FROM conversations WHERE id=? AND page_id=?')
    .get(conversation.id,pageId) as {page_name:string|null;avatar_url:string|null;last_message:string;updated_at:string;unread_count:number};
  res.json({conversation:{id:conversation.id,pageId,pageName:row.page_name||'',customerId:conversation.customer_id,
    customerName:conversation.customer_name,avatarUrl:row.avatar_url||'',lastMessage:row.last_message,updatedAt:row.updated_at,unreadCount:row.unread_count,source:'pancake'},items});
}));

conversationsRouter.get(
  '/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const conversationId = req.params.conversationId;
    if (!conversationId) {
      throw new HttpError(400, 'Missing conversation id');
    }

    const query = messagesQuerySchema.parse(req.query);
    const limit = query.limit ?? config.pancake.messageLimit;
    const pageId=query.pageId||req.staffAuth?.pageId||'';
    assertPageAccess(req,[pageId]);
    getConversationForPage(pageId,conversationId);

    // Try Pancake if configured
    if (hasPancakePageAccess(pageId)) {
      try {
        const raw = await pancakeClient.listMessages({
          pageId,
          conversationId,
          limit,
          before: query.before
        });

        const items = extractItems(raw)
          .map((item) => normalizeMessage(item, conversationId))
          .sort((a, b) => getTime(a.createdAt) - getTime(b.createdAt));
        const pagination=assessHistoryPagination(raw);
        const nextCursor = pagination.invalid?undefined:pagination.nextCursor || items[0]?.id;

        rememberMessages(pageId, conversationId, items, {
          before: query.before,
          nextCursor,
          complete: pagination.complete,
          preserveCursor:pagination.invalid,historyProgress:Boolean(query.before)||pagination.complete
        });
        if(!pagination.complete) enqueueHistoryBackfill(pageId,conversationId);

        return res.json({
          conversationId,items,nextCursor:pagination.complete?null:nextCursor,
          hasMore:!pagination.complete && Boolean(nextCursor),paginationError:pagination.invalid?pagination.reason:null
        });
      } catch (err) {
        enqueueHistoryBackfill(pageId,conversationId);
        if (!config.allowDemoMode) {
          throw new HttpError(502, 'Không tải được tin nhắn từ Pancake. Vui lòng thử lại.', 'PANCAKE_UNAVAILABLE');
        }
        console.warn(`Pancake listMessages failed for ${conversationId}, demo fallback enabled:`, err);
      }
    }

    if (!config.allowDemoMode) {
      throw new HttpError(503, 'Pancake chưa được cấu hình trên máy chủ.', 'PANCAKE_NOT_CONFIGURED');
    }

    // Fallback: fetch from SQLite database
    const db = getDatabase();
    const offset=query.before?.startsWith('count:')?Number(query.before.slice(6)):0;
    if(!Number.isSafeInteger(offset)||offset<0) throw new HttpError(400,'Mốc tải tin không hợp lệ.','INVALID_MESSAGE_CURSOR');
    const rows=db.prepare(`SELECT message_id AS id,conversation_id,sender,sender_name,text,attachments_json,created_at
      FROM conversation_message_cache WHERE page_id=? AND conversation_id=? ORDER BY created_at DESC,message_id DESC LIMIT ? OFFSET ?`)
      .all(pageId,conversationId,limit,offset) as Array<{id:string;conversation_id:string;sender:string;sender_name:string|null;text:string;attachments_json:string|null;created_at:string}>;
    const hasMore=Boolean(db.prepare('SELECT 1 FROM conversation_message_cache WHERE page_id=? AND conversation_id=? LIMIT 1 OFFSET ?').get(pageId,conversationId,offset+rows.length));
    const nextCursor=hasMore?`count:${offset+rows.length}`:null;
    rows.reverse();

    const items = rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      sender: row.sender as 'student' | 'staff' | 'system',
      senderName: row.sender_name || undefined,
      text: row.text,
      attachments: parseAttachments(row.attachments_json),
      createdAt: row.created_at
    }));

    rememberMessages(pageId, conversationId, items, { before: query.before,nextCursor:nextCursor||undefined,complete:!hasMore,historyProgress:Boolean(query.before)||!hasMore });

    res.json({
      conversationId,items,nextCursor,hasMore
    });
  })
);

conversationsRouter.post('/:conversationId/history/sync', asyncHandler(async (req, res) => {
  const body = z.object({
    pageId: z.string().trim().min(1).max(200),
    pages: z.number().int().min(1).max(5).optional().default(1),
    limit: z.number().int().min(1).max(50).optional().default(50)
  }).parse(req.body);
  const conversationId = req.params.conversationId;
  assertPageAccess(req, [body.pageId]);
  getConversationForPage(body.pageId,conversationId);
  if (!hasPancakePageAccess(body.pageId)) throw new HttpError(503, 'Đồng bộ lịch sử cần kết nối Pancake đang hoạt động.', 'PANCAKE_NOT_CONFIGURED');

  const db = getDatabase();
  let cursor = (db.prepare(`SELECT oldest_cursor FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
    .get(body.pageId, conversationId) as { oldest_cursor: string | null } | undefined)?.oldest_cursor || undefined;
  let synced = 0; let complete = false; let stopped = false; let errorMessage: string | undefined;
  for (let page = 0; page < body.pages; page += 1) {
    try {
      const raw = await pancakeClient.listMessages({ pageId: body.pageId, conversationId, limit: body.limit, before: cursor });
      const items = extractItems(raw).map((item) => normalizeMessage(item, conversationId))
        .sort((left, right) => getTime(left.createdAt) - getTime(right.createdAt));
      const pagination=assessHistoryPagination(raw);
      complete = pagination.complete;
      const suppliedCursor=pagination.nextCursor;
      const cursorMissing=!complete&&(pagination.invalid||!suppliedCursor||suppliedCursor===cursor);
      const nextCursor=cursorMissing?undefined:suppliedCursor;
      rememberMessages(body.pageId, conversationId, items, { before: cursor, nextCursor, complete,
        preserveCursor:cursorMissing,historyProgress:true,error:cursorMissing?pagination.reason||'Pancake cursor did not advance.':undefined });
      synced += items.length;
      if (cursorMissing||!items.length || complete || !nextCursor || nextCursor === cursor) {
        stopped = true;
        break;
      }
      cursor = nextCursor;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Không đồng bộ được lịch sử.';
      db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,last_synced_at,error)
        VALUES (?,?,?,?) ON CONFLICT(page_id,conversation_id) DO UPDATE SET last_synced_at=excluded.last_synced_at,error=excluded.error`)
        .run(body.pageId, conversationId, new Date().toISOString(), errorMessage);
      enqueueHistoryBackfill(body.pageId,conversationId);
      throw new HttpError(502, 'Không tải được trang lịch sử từ Pancake. Dữ liệu đã lưu vẫn được giữ.', 'HISTORY_SYNC_FAILED');
    }
  }
  const state = db.prepare(`SELECT oldest_cursor AS oldestCursor,newest_message_at AS newestMessageAt,
    oldest_message_at AS oldestMessageAt,last_synced_at AS lastSyncedAt,complete,error
    FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`).get(body.pageId,conversationId);
  if(!complete) enqueueHistoryBackfill(body.pageId,conversationId);
  res.json({ conversationId, syncedMessages: synced, complete, stopped, coverage: state, error: errorMessage || null });
}));

function extractItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const candidates = [record.conversations, record.messages, record.data, record.items];
    const matched = candidates.find(Array.isArray);
    if (matched) return matched;
  }

  return [];
}

function assertPageAccess(req: Express.Request, pageIds: string[]) {
  const allowedPageId = req.staffAuth?.pageId;
  if (!allowedPageId || pageIds.some((pageId) => pageId !== allowedPageId)) {
    throw new HttpError(403, 'Không có quyền truy cập page này.', 'PAGE_ACCESS_DENIED');
  }
}

function getPageIds(value?: string) {
  const pageIds = (value || '')
    .split(',')
    .map((pageId) => pageId.trim())
    .filter(Boolean);

  if (pageIds.length) return Array.from(new Set(pageIds));
  if (config.pancake.pageId) return [config.pancake.pageId];
  return ['demo-page'];
}

function getTime(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function parseAttachments(raw?: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getStudentOptions(pageId: string) {
  return getDatabase().prepare(`SELECT id,name,revision,updated_at AS updatedAt FROM students
    WHERE page_id=? ORDER BY name COLLATE NOCASE LIMIT 200`).all(pageId);
}
