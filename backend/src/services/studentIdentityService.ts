import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';

type StudentRow = { id: string; page_id: string; name: string; revision: number; updated_at: string };
type ConversationRow = { id: string; page_id: string; customer_id: string | null; customer_name: string };

export function listStudents(pageId: string) {
  return getDatabase().prepare(`SELECT id,page_id AS pageId,name,revision,updated_at AS updatedAt
    FROM students WHERE page_id=? ORDER BY name COLLATE NOCASE LIMIT 200`).all(pageId);
}

export function getStudent(pageId: string, studentId: string): StudentRow {
  const row = getDatabase().prepare('SELECT * FROM students WHERE id=? AND page_id=?').get(studentId, pageId) as StudentRow | undefined;
  if (!row) throw new HttpError(404, 'Không tìm thấy học viên trên page này.', 'STUDENT_NOT_FOUND');
  return row;
}

export function getConversationForPage(pageId: string, conversationId: string): ConversationRow {
  const db=getDatabase();
  let row = db.prepare('SELECT id,page_id,customer_id,customer_name FROM conversations WHERE id=? AND page_id=?')
    .get(conversationId, pageId) as ConversationRow | undefined;
  // The Pancake widget can hand us a page-scoped conversation ID before a list
  // refresh. Keep an identity-neutral stub so the staff member can explicitly
  // link it; never derive an internal student from this ID or customer name.
  if(!row) {
    const timestamp=new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO conversations(id,page_id,customer_name,last_message,updated_at)
      VALUES (?,?,?,'',?)`).run(conversationId,pageId,'Chưa xác định',timestamp);
    row=db.prepare('SELECT id,page_id,customer_id,customer_name FROM conversations WHERE id=? AND page_id=?')
      .get(conversationId,pageId) as ConversationRow|undefined;
  }
  if (!row) throw new HttpError(404, 'Chưa xác định được hội thoại trên page này. Hãy tải lại danh sách hội thoại.', 'CONVERSATION_NOT_FOUND');
  return row;
}

export function getConversationIdentity(pageId: string, conversationId: string) {
  const conversation = getConversationForPage(pageId, conversationId);
  const db = getDatabase();
  const linked = db.prepare(`SELECT s.id,s.name,s.revision FROM student_conversation_links l
    JOIN students s ON s.id=l.student_id WHERE l.page_id=? AND l.conversation_id=?`).get(pageId, conversationId) as
    { id: string; name: string; revision: number } | undefined;
  const relatedStudents = conversation.customer_id
    ? db.prepare(`SELECT DISTINCT s.id,s.name FROM student_conversation_links l
        JOIN conversations c ON c.id=l.conversation_id AND c.page_id=l.page_id
        JOIN students s ON s.id=l.student_id WHERE l.page_id=? AND c.customer_id=? ORDER BY s.name LIMIT 20`)
      .all(pageId, conversation.customer_id)
    : [];
  const legacy = db.prepare(`SELECT student_id FROM student_contexts WHERE page_id=? AND student_id IN (?,?)`)
    .all(pageId, conversation.customer_id || '', conversationId) as Array<{ student_id: string }>;
  return {
    pageId, conversationId, customerId: conversation.customer_id, customerName: conversation.customer_name,
    status: linked ? 'linked' as const : 'needs_selection' as const,
    student: linked ? { id: linked.id, name: linked.name, revision: linked.revision } : null,
    relatedStudents,
    legacyContextAvailable: legacy.length > 0,
    legacyContextKeys: legacy.map((row) => row.student_id)
  };
}

export function requireLinkedStudent(pageId: string, conversationId: string) {
  getConversationForPage(pageId, conversationId);
  const row = getDatabase().prepare(`SELECT s.id,s.name,s.page_id,s.revision FROM student_conversation_links l
    JOIN students s ON s.id=l.student_id WHERE l.page_id=? AND l.conversation_id=?`).get(pageId, conversationId) as
    { id: string; name: string; page_id: string; revision: number } | undefined;
  if (!row || row.page_id !== pageId) throw new HttpError(409, 'Hãy chọn đúng học viên cho hội thoại trước.', 'STUDENT_SELECTION_REQUIRED');
  return row;
}

export function linkConversation(input: {
  pageId: string; conversationId: string; studentId?: string; newStudentName?: string;
  staffId: string; importLegacyContext?: boolean;
}) {
  const conversation = getConversationForPage(input.pageId, input.conversationId);
  const db = getDatabase();
  const now = new Date().toISOString();
  const studentId = input.studentId || `stu-${randomUUID()}`;
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = db.prepare(`SELECT student_id AS studentId FROM student_conversation_links
      WHERE page_id=? AND conversation_id=?`).get(input.pageId,input.conversationId) as {studentId:string}|undefined;
    if (input.studentId) getStudent(input.pageId, studentId);
    else {
      const name = input.newStudentName?.trim();
      if (!name) throw new HttpError(400, 'Cần tên học viên khi tạo hồ sơ mới.', 'STUDENT_NAME_REQUIRED');
      db.prepare('INSERT INTO students(id,page_id,name,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run(studentId, input.pageId, name, now, now);
    }

    if (previous?.studentId !== studentId) {
      db.prepare(`UPDATE student_conversation_link_history SET valid_to=?
        WHERE page_id=? AND conversation_id=? AND valid_to IS NULL`)
        .run(now,input.pageId,input.conversationId);
      db.prepare(`INSERT INTO student_conversation_link_history
        (id,page_id,customer_id,conversation_id,student_id,valid_from,source,confirmed_by)
        VALUES (?,?,?,?,?,?,'staff_confirmed',?)`)
        .run(`link-history:${randomUUID()}`,input.pageId,conversation.customer_id,input.conversationId,studentId,now,input.staffId||'staff');
    }

    db.prepare(`INSERT INTO student_conversation_links(page_id,conversation_id,student_id,linked_by,linked_at)
      VALUES (?,?,?,?,?) ON CONFLICT(page_id,conversation_id) DO UPDATE SET
      student_id=excluded.student_id,linked_by=excluded.linked_by,linked_at=excluded.linked_at`)
      .run(input.pageId, input.conversationId, studentId, input.staffId || 'staff', now);

    if (input.importLegacyContext) {
      const legacyIds = [...new Set([conversation.customer_id, input.conversationId].filter((value): value is string => Boolean(value)))];
      for (const legacyId of legacyIds) {
        const old = db.prepare('SELECT * FROM student_contexts WHERE page_id=? AND student_id=?').get(input.pageId, legacyId) as
          { student_name: string; profile_json: string; memories_json: string; custom_fields_json: string; revision: number; created_at: string; updated_at: string } | undefined;
        if (!old) continue;
        // Keep the legacy row and copy only after the staff member explicitly asks.
        db.prepare(`INSERT OR IGNORE INTO student_contexts(page_id,student_id,student_name,profile_json,memories_json,
          custom_fields_json,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(input.pageId, studentId, input.newStudentName || old.student_name, old.profile_json, old.memories_json,
            old.custom_fields_json, old.revision, now, now);
        migrateLegacyContextFacts(db,input.pageId,legacyId,studentId,old,now);
        break;
      }
    }
    const affectedStudents = [...new Set([previous?.studentId,studentId].filter((value):value is string=>Boolean(value)))];
    for (const affectedId of affectedStudents) {
      if(previous?.studentId!==studentId || (affectedId===studentId&&input.importLegacyContext)) {
        db.prepare('UPDATE students SET revision=revision+1,updated_at=? WHERE id=?').run(now,affectedId);
        db.prepare('DELETE FROM student_summary_snapshots WHERE student_id=?').run(affectedId);
      }
      db.prepare(`INSERT INTO student_audit_events(id,student_id,action,entity_type,entity_id,changed_by,payload_json,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(`audit-${randomUUID()}`,affectedId,'link','conversation',input.conversationId,
          input.staffId||'staff',JSON.stringify({pageId:input.pageId,previousStudentId:previous?.studentId||null,studentId}),now);
    }
    if(db.prepare(`SELECT 1 FROM conversation_message_cache WHERE page_id=? AND conversation_id=? LIMIT 1`)
      .get(input.pageId,input.conversationId)) {
      db.prepare(`INSERT INTO student_proposal_extraction_jobs
        (page_id,conversation_id,student_id,status,attempts,next_run_at,last_error,updated_at)
        VALUES (?,?,?,'queued',0,?,NULL,?) ON CONFLICT(page_id,conversation_id,student_id) DO UPDATE SET
        status='queued',attempts=0,next_run_at=excluded.next_run_at,last_error=NULL,updated_at=excluded.updated_at`)
        .run(input.pageId,input.conversationId,studentId,now,now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getConversationIdentity(input.pageId, input.conversationId);
}

function migrateLegacyContextFacts(db:ReturnType<typeof getDatabase>,pageId:string,legacyId:string,studentId:string,
  old:{profile_json:string;memories_json:string;custom_fields_json:string},timestamp:string) {
  if(db.prepare('SELECT 1 FROM student_legacy_migrations WHERE page_id=? AND legacy_student_id=? AND student_id=?')
    .get(pageId,legacyId,studentId)) return;
  const parse=(value:string):unknown=>{try{return JSON.parse(value)}catch{return null}};
  const profile=parse(old.profile_json) as Record<string,unknown>|null;
  const memories=parse(old.memories_json);
  const fields=parse(old.custom_fields_json);
  const rows:Array<{kind:string;content:string;sensitivity:string}> = [];
  const add=(kind:string,value:unknown,sensitivity='normal')=>{if(typeof value==='string'&&value.trim()) rows.push({kind,content:value.trim().slice(0,5000),sensitivity});};
  add('preference',profile?.recipientCall);
  add('preference',profile?.senderCall);
  add('learning_note',profile?.nextAction);
  add('learning_note',profile?.studyNotes,'private');
  add('learning_note',profile?.specialNotes,'private');
  if(Array.isArray(memories)) for(const memory of memories) if(memory&&typeof memory==='object') {
    const item=memory as Record<string,unknown>;
    if(item.status==='active'||item.status==='confirmed') add('learning_note',item.content);
  }
  if(Array.isArray(fields)) for(const field of fields) if(field&&typeof field==='object') {
    const item=field as Record<string,unknown>;
    if(item.useInSuggestions===true) add('learning_note',item.value);
  }
  for(const fact of rows) db.prepare(`INSERT INTO student_facts(id,student_id,kind,content,verification_status,sensitivity,
    status,use_in_suggestions,created_by,created_at,updated_at) VALUES (?,?,?,?,'legacy_unverified',?,'active',0,'legacy_migration',?,?)`)
    .run(`legacy-fact:${randomUUID()}`,studentId,fact.kind,fact.content,fact.sensitivity,timestamp,timestamp);
  db.prepare('INSERT INTO student_legacy_migrations(page_id,legacy_student_id,student_id,migrated_at) VALUES (?,?,?,?)')
    .run(pageId,legacyId,studentId,timestamp);
}

export function requireMessageBelongsToPage(pageId: string, conversationId: string, messageId: string) {
  const row = getDatabase().prepare(`SELECT 1 FROM conversation_message_cache
    WHERE page_id=? AND conversation_id=? AND message_id=?`).get(pageId, conversationId, messageId);
  if (!row) throw new HttpError(404, 'Chưa lưu được tin nhắn nguồn.', 'SOURCE_MESSAGE_NOT_FOUND');
}

export function getCachedMessage(pageId:string,conversationId:string,messageId:string) {
  const row=getDatabase().prepare(`SELECT message_id AS id,sender,sender_name AS senderName,text,created_at AS createdAt
    FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?`)
    .get(pageId,conversationId,messageId) as {id:string;sender:string;senderName:string|null;text:string;createdAt:string}|undefined;
  if(!row) throw new HttpError(404,'Chưa lưu được tin nhắn nguồn.','SOURCE_MESSAGE_NOT_FOUND');
  return row;
}

export function getEffectiveMessageStudent(pageId:string,conversationId:string,messageId?:string) {
  const db=getDatabase();
  if(!messageId) return requireLinkedStudent(pageId,conversationId).id;
  const message=getCachedMessage(pageId,conversationId,messageId);
  const row=db.prepare(`SELECT student_id AS studentId FROM conversation_message_student_links
    WHERE page_id=? AND conversation_id=? AND message_id=?`).get(pageId,conversationId,messageId) as {studentId:string}|undefined;
  if(row) {
    getStudent(pageId,row.studentId);
    return row.studentId;
  }
  const historical=db.prepare(`SELECT student_id AS studentId FROM student_conversation_link_history
    WHERE page_id=? AND conversation_id=? AND julianday(valid_from)<=julianday(?) AND (valid_to IS NULL OR julianday(?)<julianday(valid_to))
    ORDER BY julianday(valid_from) DESC LIMIT 1`).get(pageId,conversationId,message.createdAt,message.createdAt) as {studentId:string}|undefined;
  if(!historical) throw new HttpError(409,'Tin nhắn chưa được gắn rõ với học viên.','STUDENT_SELECTION_REQUIRED');
  getStudent(pageId,historical.studentId);
  return historical.studentId;
}

export function filterMessagesForStudent<T extends {id?:string}>(pageId:string,conversationId:string,studentId:string|undefined,messages:T[]) {
  if(!studentId) return [];
  return messages.flatMap((message)=>{
    if(!message.id) return [];
    try {
      if(getEffectiveMessageStudent(pageId,conversationId,message.id)!==studentId) return [];
      const canonical=getCachedMessage(pageId,conversationId,message.id);
      return [{...message,sender:canonical.sender,senderName:canonical.senderName,text:canonical.text,createdAt:canonical.createdAt}];
    } catch { return []; }
  });
}

export function getLatestStudentMessageForStudent(pageId:string,conversationId:string,studentId:string) {
  return getDatabase().prepare(`SELECT c.message_id AS id,c.created_at AS createdAt FROM conversation_message_cache c
    WHERE c.page_id=? AND c.conversation_id=? AND c.sender='student' AND (
      EXISTS (SELECT 1 FROM conversation_message_student_links m WHERE m.page_id=c.page_id AND m.conversation_id=c.conversation_id
        AND m.message_id=c.message_id AND m.student_id=?) OR (
        NOT EXISTS (SELECT 1 FROM conversation_message_student_links m WHERE m.page_id=c.page_id AND m.conversation_id=c.conversation_id AND m.message_id=c.message_id)
        AND EXISTS (SELECT 1 FROM student_conversation_link_history h WHERE h.page_id=c.page_id AND h.conversation_id=c.conversation_id
          AND h.student_id=? AND julianday(h.valid_from)<=julianday(c.created_at) AND (h.valid_to IS NULL OR julianday(c.created_at)<julianday(h.valid_to)))
      )) ORDER BY c.created_at DESC LIMIT 1`).get(pageId,conversationId,studentId,studentId) as {id:string;createdAt:string}|undefined;
}

export function listCachedMessagesForStudent(pageId:string,conversationId:string,studentId:string,limit=50) {
  const rows=getDatabase().prepare(`SELECT c.message_id AS id,c.conversation_id AS conversationId,c.sender,c.sender_name AS senderName,c.text,
      c.attachments_json AS attachmentsJson,c.created_at AS createdAt FROM conversation_message_cache c
    WHERE c.page_id=? AND c.conversation_id=? AND (
      EXISTS (SELECT 1 FROM conversation_message_student_links m WHERE m.page_id=c.page_id AND m.conversation_id=c.conversation_id
        AND m.message_id=c.message_id AND m.student_id=?) OR (
        NOT EXISTS (SELECT 1 FROM conversation_message_student_links m WHERE m.page_id=c.page_id AND m.conversation_id=c.conversation_id AND m.message_id=c.message_id)
        AND EXISTS (SELECT 1 FROM student_conversation_link_history h WHERE h.page_id=c.page_id AND h.conversation_id=c.conversation_id
          AND h.student_id=? AND julianday(h.valid_from)<=julianday(c.created_at) AND (h.valid_to IS NULL OR julianday(c.created_at)<julianday(h.valid_to)))
      )) ORDER BY c.created_at DESC LIMIT ?`).all(pageId,conversationId,studentId,studentId,Math.max(1,Math.min(1000,limit))) as
    Array<{id:string;conversationId:string;sender:string;senderName:string|null;text:string;attachmentsJson:string|null;createdAt:string}>;
  return rows.reverse();
}

export function listConversationMessageStudents(pageId: string, conversationId: string) {
  getConversationForPage(pageId, conversationId);
  return getDatabase().prepare(`SELECT l.message_id AS messageId,l.student_id AS studentId,s.name AS studentName
    FROM conversation_message_student_links l JOIN students s ON s.id=l.student_id
    WHERE l.page_id=? AND l.conversation_id=? ORDER BY l.linked_at DESC LIMIT 500`).all(pageId, conversationId);
}

export function linkConversationMessages(input: {
  pageId: string; conversationId: string; studentId: string; messageIds: string[]; staffId: string; reassign?: boolean;
}) {
  getConversationForPage(input.pageId,input.conversationId);
  getStudent(input.pageId,input.studentId);
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const messageId of new Set(input.messageIds)) {
      requireMessageBelongsToPage(input.pageId, input.conversationId, messageId);
      const current = db.prepare(`SELECT student_id FROM conversation_message_student_links
        WHERE page_id=? AND conversation_id=? AND message_id=?`).get(input.pageId, input.conversationId, messageId) as { student_id: string } | undefined;
      if (current && current.student_id !== input.studentId && !input.reassign) {
        throw new HttpError(409, 'Tin đã được gắn với học viên khác. Cần xác nhận chuyển nguồn.', 'MESSAGE_STUDENT_CONFLICT');
      }
      if (current && current.student_id !== input.studentId) {
        const sourceUsed = db.prepare(`SELECT 1 FROM issue_evidence e JOIN issue_occurrences o ON o.id=e.occurrence_id
            JOIN student_issues i ON i.id=o.issue_id WHERE e.conversation_id=? AND e.message_id=? AND i.student_id=?
          UNION ALL SELECT 1 FROM student_facts WHERE source_conversation_id=? AND source_message_id=? AND student_id=?
          UNION ALL SELECT 1 FROM student_proposals WHERE source_conversation_id=? AND source_message_id=? AND student_id=?
          UNION ALL SELECT 1 FROM student_submissions WHERE conversation_id=? AND source_message_id=? AND student_id=?
          UNION ALL SELECT 1 FROM student_review_sessions WHERE conversation_id=? AND source_message_id=? AND student_id=?
          UNION ALL SELECT 1 FROM issue_practice_actions a JOIN student_issues i ON i.id=a.issue_id
            WHERE a.source_message_id=? AND i.student_id=? LIMIT 1`)
          .get(input.conversationId,messageId,current.student_id,input.conversationId,messageId,current.student_id,
            input.conversationId,messageId,current.student_id,input.conversationId,messageId,current.student_id,
            input.conversationId,messageId,current.student_id,messageId,current.student_id);
        if (sourceUsed) throw new HttpError(409, 'Tin đã được dùng trong dữ kiện, bài nộp hoặc bằng chứng. Hãy sửa hồ sơ cũ trước khi chuyển nguồn.', 'MESSAGE_SOURCE_IN_USE');
      }
      db.prepare(`INSERT INTO conversation_message_student_links(page_id,conversation_id,message_id,student_id,linked_by,linked_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(page_id,conversation_id,message_id) DO UPDATE SET
        student_id=excluded.student_id,linked_by=excluded.linked_by,linked_at=excluded.linked_at`)
        .run(input.pageId, input.conversationId, messageId, input.studentId, input.staffId || 'staff', new Date().toISOString());
      if(!current||current.student_id!==input.studentId) {
        const timestamp=new Date().toISOString();
        for(const affectedId of new Set([current?.student_id,input.studentId].filter((value):value is string=>Boolean(value)))) {
          db.prepare('UPDATE students SET revision=revision+1,updated_at=? WHERE id=?').run(timestamp,affectedId);
          db.prepare('DELETE FROM student_summary_snapshots WHERE student_id=?').run(affectedId);
          db.prepare(`INSERT INTO student_audit_events(id,student_id,action,entity_type,entity_id,changed_by,payload_json,created_at)
            VALUES (?,?,?,?,?,?,?,?)`).run(`audit-${randomUUID()}`,affectedId,'link','message',messageId,input.staffId||'staff',
              JSON.stringify({pageId:input.pageId,conversationId:input.conversationId,previousStudentId:current?.student_id||null,studentId:input.studentId}),timestamp);
        }
      }
    }
    if(input.messageIds.length) {
      const rows=input.messageIds.map((messageId)=>db.prepare(`SELECT rowid AS rowId FROM conversation_message_cache
        WHERE page_id=? AND conversation_id=? AND message_id=?`).get(input.pageId,input.conversationId,messageId) as {rowId:number}|undefined)
        .filter((row):row is {rowId:number}=>Boolean(row));
      if(rows.length) {
        const earliest=Math.min(...rows.map((row)=>row.rowId))-1;
        db.prepare(`UPDATE student_proposal_extraction_state SET last_message_rowid=MIN(last_message_rowid,?),updated_at=?
          WHERE page_id=? AND conversation_id=? AND student_id=?`)
          .run(earliest,new Date().toISOString(),input.pageId,input.conversationId,input.studentId);
        const timestamp=new Date().toISOString();
        db.prepare(`INSERT INTO student_proposal_extraction_jobs
          (page_id,conversation_id,student_id,status,attempts,next_run_at,last_error,updated_at)
          VALUES (?,?,?,'queued',0,?,NULL,?) ON CONFLICT(page_id,conversation_id,student_id) DO UPDATE SET
          status='queued',attempts=0,next_run_at=excluded.next_run_at,last_error=NULL,updated_at=excluded.updated_at`)
          .run(input.pageId,input.conversationId,input.studentId,timestamp,timestamp);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return listConversationMessageStudents(input.pageId, input.conversationId);
}

export function rememberConversations(items: Array<{
  id: string; pageId: string; pageName?: string; customerId?: string; customerName: string;
  avatarUrl?: string; lastMessage: string; unreadCount: number; updatedAt: string;
}>) {
  const db = getDatabase();
  const statement = db.prepare(`INSERT INTO conversations
    (id,page_id,page_name,customer_id,customer_name,avatar_url,last_message,unread_count,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET page_id=excluded.page_id,page_name=excluded.page_name,
    customer_id=excluded.customer_id,customer_name=excluded.customer_name,avatar_url=excluded.avatar_url,
    last_message=excluded.last_message,unread_count=excluded.unread_count,updated_at=excluded.updated_at`);
  db.exec('BEGIN');
  try {
    for (const item of items) statement.run(item.id,item.pageId,item.pageName || null,item.customerId || null,
      item.customerName,item.avatarUrl || null,item.lastMessage,item.unreadCount,item.updatedAt);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function rememberMessages(pageId: string, conversationId: string, messages: Array<{
  id: string; sender: string; senderName?: string; text: string; attachments?: unknown[]; createdAt: string;
}>, options: { before?: string; nextCursor?: string; complete?: boolean; error?: string; preserveCursor?: boolean;historyProgress?:boolean } = {}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const ordered = [...messages].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
  db.exec('BEGIN');
  try {
    // Sender and creation time define a message's provenance. Preserve them
    // from first observation so an edit cannot move a message to another student.
    const stableOrdered = ordered.map((message) => {
      const previous = db.prepare(`SELECT sender,created_at AS createdAt FROM conversation_message_cache
        WHERE page_id=? AND conversation_id=? AND message_id=?`).get(pageId,conversationId,message.id) as
        {sender:string;createdAt:string}|undefined;
      return previous ? {...message,sender:previous.sender,createdAt:previous.createdAt} : message;
    });
    const statement = db.prepare(`INSERT INTO conversation_message_cache(page_id,conversation_id,message_id,sender,sender_name,text,attachments_json,created_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(page_id,conversation_id,message_id) DO UPDATE SET
      sender_name=excluded.sender_name,text=excluded.text,attachments_json=excluded.attachments_json`);
    for (const message of stableOrdered) statement.run(pageId,conversationId,message.id,message.sender,message.senderName || null,
      message.text,JSON.stringify(message.attachments || []),message.createdAt);
    const first = stableOrdered[0]; const last = stableOrdered[stableOrdered.length - 1];
    const historyProgress=options.historyProgress===true;
    db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,oldest_cursor,newest_message_at,oldest_message_at,last_synced_at,complete,error)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(page_id,conversation_id) DO UPDATE SET
      oldest_cursor=CASE WHEN ?=1 AND ?=0
        THEN COALESCE(excluded.oldest_cursor,conversation_sync_state.oldest_cursor) ELSE conversation_sync_state.oldest_cursor END,
      newest_message_at=MAX(COALESCE(conversation_sync_state.newest_message_at,''),COALESCE(excluded.newest_message_at,'')),
      oldest_message_at=CASE WHEN conversation_sync_state.oldest_message_at IS NULL THEN excluded.oldest_message_at
        WHEN excluded.oldest_message_at IS NULL THEN conversation_sync_state.oldest_message_at
        ELSE MIN(conversation_sync_state.oldest_message_at,excluded.oldest_message_at) END,
      last_synced_at=excluded.last_synced_at,
      complete=CASE WHEN ?=1 THEN excluded.complete ELSE conversation_sync_state.complete END,
      error=CASE WHEN ?=1 THEN excluded.error ELSE conversation_sync_state.error END`)
      .run(pageId,conversationId,historyProgress&&!options.preserveCursor?options.nextCursor||options.before||first?.id||null:null,
        last?.createdAt||null,first?.createdAt||null,now,historyProgress&&options.complete?1:0,historyProgress?options.error||null:null,
        historyProgress?1:0,options.preserveCursor?1:0,historyProgress?1:0,historyProgress?1:0);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const affectedStudents=db.prepare(`SELECT student_id AS studentId FROM student_conversation_link_history WHERE page_id=? AND conversation_id=?
    UNION SELECT student_id AS studentId FROM conversation_message_student_links WHERE page_id=? AND conversation_id=?`)
    .all(pageId,conversationId,pageId,conversationId) as Array<{studentId:string}>;
  for(const student of affectedStudents) db.prepare('DELETE FROM student_summary_snapshots WHERE student_id=?').run(student.studentId);
  if(messages.length) {
    const queue=db.prepare(`INSERT INTO student_proposal_extraction_jobs
      (page_id,conversation_id,student_id,status,attempts,next_run_at,last_error,updated_at)
      VALUES (?,?,?,'queued',0,?,NULL,?) ON CONFLICT(page_id,conversation_id,student_id) DO UPDATE SET
      status='queued',attempts=0,next_run_at=excluded.next_run_at,last_error=NULL,updated_at=excluded.updated_at`);
    for(const student of affectedStudents) queue.run(pageId,conversationId,student.studentId,now,now);
  }
}
