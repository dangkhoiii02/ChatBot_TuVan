import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { withTransaction } from '../db/transaction.js';
import { HttpError } from '../utils/httpError.js';
import { getCachedMessage, getEffectiveMessageStudent, getStudent } from './studentIdentityService.js';

const uid = (prefix: string) => `${prefix}-${randomUUID()}`;
const now = () => new Date().toISOString();
const normalizeTitle = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g, ' ').trim();

type IssueView = 'all' | 'recent' | 'unresolved';

export function getStudentSummary(pageId: string, studentId: string,options:{writeCache?:boolean}={}) {
  const student = getStudent(pageId, studentId);
  const db = getDatabase();
  const timestamp = now();
  const cached = db.prepare('SELECT payload_json,valid_until AS validUntil FROM student_summary_snapshots WHERE student_id=?').get(studentId) as { payload_json: string; validUntil:string|null } | undefined;
  if (cached) {
    try {
      const payload = JSON.parse(cached.payload_json) as { revision?: number };
      if (payload.revision === student.revision && (!cached.validUntil||cached.validUntil>timestamp)) return payload;
    } catch { /* recompute a stale/corrupt snapshot */ }
  }

  const facts = db.prepare(`SELECT id,kind,content,source_text AS sourceText,source_message_id AS sourceMessageId,
    source_conversation_id AS sourceConversationId,occurred_at AS occurredAt,expires_at AS expiresAt,
    use_in_suggestions AS useInSuggestions,created_by AS createdBy,created_at AS createdAt,
    sensitivity,verification_status AS verificationStatus,conflict_status AS conflictStatus,conflict_key AS conflictKey
    FROM student_facts WHERE student_id=? AND status='active' AND (expires_at IS NULL OR expires_at>?)
    ORDER BY CASE kind WHEN 'preference' THEN 0 WHEN 'learning_note' THEN 1 ELSE 2 END,updated_at DESC LIMIT 100`)
    .all(studentId, timestamp);
  const expiredFacts=db.prepare(`SELECT id,kind,content,source_text AS sourceText,source_message_id AS sourceMessageId,
    source_conversation_id AS sourceConversationId,occurred_at AS occurredAt,expires_at AS expiresAt,
    use_in_suggestions AS useInSuggestions,created_by AS createdBy,created_at AS createdAt,
    sensitivity,verification_status AS verificationStatus,conflict_status AS conflictStatus,conflict_key AS conflictKey
    FROM student_facts WHERE student_id=? AND status='active' AND expires_at IS NOT NULL AND expires_at<=?
    ORDER BY expires_at DESC LIMIT 100`).all(studentId,timestamp);
  const assignments = listAssignments(pageId, studentId);
  const submissions = listSubmissions(pageId, studentId, 'pending');
  const openIssues = listIssues(pageId, studentId, 'unresolved', 50, 0).items;
  const allIssues = listIssues(pageId, studentId, 'all', 50, 0).items;
  const legacy = db.prepare(`SELECT profile_json,memories_json,custom_fields_json,revision,updated_at
    FROM student_contexts WHERE page_id=? AND student_id=?`).get(pageId, studentId) as
    { profile_json: string; memories_json: string; custom_fields_json: string; revision: number; updated_at: string } | undefined;
  let legacyProfile: unknown = null; let legacyMemories: unknown[] = []; let legacyFields: unknown[] = [];
  if (legacy) {
    try { legacyProfile = JSON.parse(legacy.profile_json); } catch { /* preserve malformed legacy data outside AI context */ }
    try { legacyMemories = JSON.parse(legacy.memories_json); } catch { /* see above */ }
    try { legacyFields = JSON.parse(legacy.custom_fields_json); } catch { /* see above */ }
  }
  const coverageRows = db.prepare(`SELECT st.last_synced_at AS lastSyncedAt,st.oldest_message_at AS oldestMessageAt,
    st.newest_message_at AS newestMessageAt,st.complete,st.error,l.fullLink FROM (
      SELECT page_id,conversation_id,1 AS fullLink FROM student_conversation_link_history WHERE page_id=? AND student_id=?
      UNION
      SELECT DISTINCT m.page_id,m.conversation_id,0 AS fullLink FROM conversation_message_student_links m
        WHERE m.page_id=? AND m.student_id=? AND NOT EXISTS (SELECT 1 FROM student_conversation_links c
          WHERE c.page_id=m.page_id AND c.conversation_id=m.conversation_id AND c.student_id=m.student_id)
    ) l LEFT JOIN conversation_sync_state st ON st.page_id=l.page_id AND st.conversation_id=l.conversation_id`)
    .all(pageId,studentId,pageId,studentId) as Array<{
      lastSyncedAt: string | null; oldestMessageAt: string | null; newestMessageAt: string | null; complete: number | null; error: string | null; fullLink:number;
    }>;
  const synced = coverageRows.filter((item) => item.lastSyncedAt);
  const result = {
    pageId, studentId, studentName: student.name, revision: student.revision,
    profile: legacyProfile, legacyMemories, legacyCustomFields: legacyFields,
    facts, expiredFacts, assignments, submissions, issues: allIssues, unresolvedIssues: openIssues,
    historyCoverage: {
      status: !synced.length ? 'unknown' : synced.some((item) => item.error) || coverageRows.some((item)=>item.fullLink===0) ? 'partial' : coverageRows.every((item) => item.complete === 1) ? 'complete' : 'partial',
      lastSyncedAt: synced.map((item) => item.lastSyncedAt).sort().at(-1) || null,
      oldestMessageAt: synced.map((item) => item.oldestMessageAt).filter(Boolean).sort()[0] || null,
      newestMessageAt: synced.map((item) => item.newestMessageAt).filter(Boolean).sort().at(-1) || null,
      linkedConversationCount: coverageRows.length,
      syncedConversationCount: synced.length,
      errors: coverageRows.filter((item) => item.error).map((item) => item.error)
    },
    updatedAt: student.updated_at,
    legacyUpdatedAt: legacy?.updated_at || null
  };
  const validUntil=facts.map((fact)=>typeof (fact as {expiresAt?:string|null}).expiresAt==='string'?(fact as {expiresAt:string}).expiresAt:'')
    .filter(Boolean).sort()[0]||null;
  if(options.writeCache!==false) db.prepare(`INSERT INTO student_summary_snapshots(student_id,payload_json,generated_at,valid_until)
    VALUES (?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET payload_json=excluded.payload_json,generated_at=excluded.generated_at,valid_until=excluded.valid_until`)
    .run(studentId, JSON.stringify(result), timestamp,validUntil);
  return result;
}

export function listFacts(pageId: string, studentId: string, includeArchived = false) {
  getStudent(pageId, studentId);
  const where = includeArchived ? '' : "AND status='active'";
  return getDatabase().prepare(`SELECT id,kind,content,source_text AS sourceText,source_message_id AS sourceMessageId,
    source_conversation_id AS sourceConversationId,occurred_at AS occurredAt,expires_at AS expiresAt,status,
    use_in_suggestions AS useInSuggestions,created_by AS createdBy,created_at AS createdAt,updated_at AS updatedAt,
    sensitivity,verification_status AS verificationStatus,conflict_status AS conflictStatus,conflict_key AS conflictKey
    FROM student_facts WHERE student_id=? ${where} ORDER BY created_at DESC LIMIT 200`).all(studentId);
}

export function createFact(input: {
  pageId: string; studentId: string; staffId: string; kind: 'preference'|'event'|'learning_note'; content: string;
  sourceText?: string; sourceMessageId?: string; sourceConversationId?: string; occurredAt?: string; expiresAt?: string; useInSuggestions?: boolean;
  sensitivity?:'normal'|'private';verificationStatus?:'confirmed'|'legacy_unverified';conflictKey?:string;
}) {
  getStudent(input.pageId, input.studentId);
  if (input.sourceConversationId) {
    const sourceStudent=getEffectiveMessageStudent(input.pageId,input.sourceConversationId,input.sourceMessageId);
    if(sourceStudent!==input.studentId) throw new HttpError(409,'Tin nhắn nguồn thuộc một học viên khác.','STUDENT_LINK_MISMATCH');
    if(input.sourceMessageId) {
      const message=getCachedMessage(input.pageId,input.sourceConversationId,input.sourceMessageId);
      if(!input.sourceText?.trim()) throw new HttpError(400,'Cần lưu trích dẫn nguồn nguyên văn.','SOURCE_QUOTE_REQUIRED');
      if(!message.text.includes(input.sourceText.trim()))
        throw new HttpError(400,'Trích dẫn phải khớp nguyên văn tin nhắn nguồn.','SOURCE_QUOTE_MISMATCH');
    }
  } else if(input.sourceMessageId) {
    throw new HttpError(400,'Cần hội thoại đi kèm ID tin nhắn nguồn.','SOURCE_CONVERSATION_REQUIRED');
  }
  const db = getDatabase(); const timestamp = now(); const id = uid('fact');
  const conflictKey=input.conflictKey?.trim()||inferConflictKey(input.kind,input.content);
  const privacy=input.kind==='event'?(input.sensitivity||'private'):(input.sensitivity||'normal');
  withTransaction(db,()=>{
    db.prepare(`INSERT INTO student_facts(id,student_id,kind,content,conflict_key,conflict_status,verification_status,sensitivity,
      source_text,source_message_id,source_conversation_id,occurred_at,expires_at,status,use_in_suggestions,use_requested,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?)`)
      .run(id,input.studentId,input.kind,input.content.trim(),conflictKey||null,'none',
        input.verificationStatus||'confirmed',privacy,input.sourceText || null,input.sourceMessageId || null,
        input.sourceConversationId || null,input.occurredAt || timestamp,input.expiresAt || null,0,
        input.useInSuggestions===false?0:1,input.staffId || 'staff',timestamp,timestamp);
    if(conflictKey) refreshFactConflict(input.studentId,conflictKey,timestamp);
    else db.prepare(`UPDATE student_facts SET use_in_suggestions=CASE WHEN use_requested=1 AND sensitivity='normal'
      AND verification_status='confirmed' THEN 1 ELSE 0 END WHERE id=?`).run(id);
    const createdState=db.prepare(`SELECT conflict_status AS conflictStatus,use_in_suggestions AS useInSuggestions,use_requested AS useRequested
      FROM student_facts WHERE id=?`).get(id);
    audit(input.studentId,'create','fact',id,input.staffId,{kind:input.kind,content:input.content,conflictKey:conflictKey||null,
      conflictStatus:createdState?.conflictStatus,useInSuggestions:createdState?.useInSuggestions,useRequested:createdState?.useRequested});
    touch(input.studentId);
  });
  return listFacts(input.pageId,input.studentId,true);
}

export function updateFact(input: {
  pageId: string; studentId: string; factId: string; staffId: string; kind?:'preference'|'event'|'learning_note';content?: string; status?: 'active'|'archived';
  expiresAt?: string | null; useInSuggestions?: boolean;verificationStatus?:'confirmed'|'legacy_unverified';
  sensitivity?:'normal'|'private';
  conflictResolution?:'keep_current'|'use_this';
}) {
  getStudent(input.pageId,input.studentId);
  const db = getDatabase();
  withTransaction(db,()=>{
    const found = db.prepare(`SELECT id,kind,content,status,conflict_key AS conflictKey,conflict_status AS conflictStatus,
      sensitivity,verification_status AS verificationStatus,use_requested AS useRequested FROM student_facts WHERE id=? AND student_id=?`)
      .get(input.factId,input.studentId) as {id:string;kind:string;content:string;status:string;conflictKey:string|null;conflictStatus:string;
        sensitivity:string;verificationStatus:string;useRequested:number}|undefined;
    if (!found) throw new HttpError(404,'Không tìm thấy ghi chú.','FACT_NOT_FOUND');
    if(input.conflictResolution) {
      if(found.conflictStatus!=='pending'||!found.conflictKey) throw new HttpError(409,'Ghi chú này không có xung đột đang chờ xử lý.','FACT_CONFLICT_NOT_PENDING');
      const timestamp=now();
      if(input.conflictResolution==='use_this') {
        db.prepare(`UPDATE student_facts SET use_in_suggestions=0,status='archived',conflict_status='resolved',updated_at=?
          WHERE student_id=? AND conflict_key=? AND id<>?`).run(timestamp,input.studentId,found.conflictKey,input.factId);
        db.prepare(`UPDATE student_facts SET status='active',conflict_status='resolved',
          use_in_suggestions=CASE WHEN use_requested=1 AND sensitivity='normal' AND verification_status='confirmed' THEN 1 ELSE 0 END,updated_at=?
          WHERE id=? AND student_id=?`).run(timestamp,input.factId,input.studentId);
      } else {
        const current=db.prepare(`SELECT id FROM student_facts WHERE student_id=? AND conflict_key=? AND status='active'
          ORDER BY created_at,rowid LIMIT 1`).get(input.studentId,found.conflictKey) as {id:string}|undefined;
        db.prepare(`UPDATE student_facts SET status=CASE WHEN id=? THEN 'active' ELSE 'archived' END,
          use_in_suggestions=CASE WHEN id=? AND use_requested=1 AND sensitivity='normal' AND verification_status='confirmed' THEN 1 ELSE 0 END,
          conflict_status='resolved',updated_at=? WHERE student_id=? AND conflict_key=?`)
          .run(current?.id||input.factId,current?.id||input.factId,timestamp,input.studentId,found.conflictKey);
      }
    } else {
      const nextKind=input.kind||found.kind;
      const nextContent=input.content?.trim()||found.content;
      const inferredKey=inferConflictKey(nextKind as 'preference'|'event'|'learning_note',nextContent);
      const nextConflictKey=nextKind!=='preference'?null:inferredKey||
        (found.conflictKey==='preferred_name'?null:found.conflictKey);
      const nextSensitivity=input.sensitivity||found.sensitivity;
      const nextVerification=input.verificationStatus||found.verificationStatus;
      const requestedUse=input.useInSuggestions===undefined?Number(found.useRequested):input.useInSuggestions?1:0;
      const nextStatus=input.status||found.status;
      const useValue=nextStatus==='active'&&requestedUse===1&&nextSensitivity==='normal'&&nextVerification==='confirmed'?1:0;
      const timestamp=now();
      db.prepare(`UPDATE student_facts SET kind=?,content=?,status=?,conflict_key=?,conflict_status=?,
        expires_at=CASE WHEN ?=1 THEN ? ELSE expires_at END,use_requested=?,use_in_suggestions=?,
        sensitivity=?,verification_status=?,updated_at=? WHERE id=? AND student_id=?`)
        .run(nextKind,nextContent,nextStatus,nextConflictKey,nextStatus==='archived'?'resolved':'none',
          input.expiresAt!==undefined?1:0,input.expiresAt??null,requestedUse,useValue,nextSensitivity,nextVerification,
          timestamp,input.factId,input.studentId);
      const keys=new Set([found.conflictKey,nextConflictKey].filter((key):key is string=>Boolean(key)));
      for(const key of keys) refreshFactConflict(input.studentId,key,timestamp);
    }
    const finalFact=db.prepare(`SELECT kind,content,status,conflict_key AS conflictKey,conflict_status AS conflictStatus,
      use_in_suggestions AS useInSuggestions,use_requested AS useRequested FROM student_facts WHERE id=? AND student_id=?`)
      .get(input.factId,input.studentId);
    const finalConflictKey=(finalFact as {conflictKey?:string|null}|undefined)?.conflictKey;
    const conflictKeys=[...new Set([found.conflictKey,finalConflictKey].filter((key):key is string=>Boolean(key)))];
    const conflictGroup=conflictKeys.flatMap((conflictKey)=>db.prepare(`SELECT id,content,status,conflict_key AS conflictKey,
      conflict_status AS conflictStatus,use_in_suggestions AS useInSuggestions FROM student_facts
      WHERE student_id=? AND conflict_key=? ORDER BY created_at,id`).all(input.studentId,conflictKey));
    audit(input.studentId,'update','fact',input.factId,input.staffId,{request:input,previous:{kind:found.kind,content:found.content,
      status:found.status,conflictKey:found.conflictKey,conflictStatus:found.conflictStatus},result:finalFact,conflictGroup});
    touch(input.studentId);
  });
  return listFacts(input.pageId,input.studentId,true);
}

export function listAssignments(pageId: string, studentId: string) {
  getStudent(pageId,studentId);
  const db=getDatabase();
  const rows = getDatabase().prepare(`SELECT a.id,a.title,a.normalized_title AS normalizedTitle,
    CASE WHEN TRIM(COALESCE(a.started_source,''))<>'' THEN a.started_at ELSE NULL END AS startedAt,
    CASE WHEN TRIM(COALESCE(a.started_source,''))='' THEN a.started_at ELSE NULL END AS unverifiedStartedAt,
    CASE WHEN TRIM(COALESCE(a.started_source,''))<>'' THEN 'verified' ELSE 'missing' END AS startedEvidenceStatus,
    a.started_source AS startedSource,a.status,a.completed_at AS completedAt,a.completion_evidence AS completionEvidence,
    a.revision,a.created_at AS createdAt,a.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM student_review_sessions r WHERE r.assignment_id=a.id AND r.status='confirmed') AS reviewSessionCount,
    (SELECT MAX(r.reviewed_at) FROM student_review_sessions r WHERE r.assignment_id=a.id) AS lastReviewedAt,
    (SELECT MAX(s.submitted_at) FROM student_submissions s WHERE s.assignment_id=a.id) AS lastSubmittedAt,
    (SELECT COUNT(*) FROM student_submissions s WHERE s.assignment_id=a.id AND s.status='pending') AS pendingSubmissionCount,
    (SELECT COUNT(*) FROM student_review_sessions r WHERE r.assignment_id=a.id AND r.status='draft') AS unconfirmedReviewCount
    FROM student_assignments a WHERE a.student_id=? ORDER BY CASE a.status WHEN 'active' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END,
    COALESCE(a.started_at,a.created_at) DESC LIMIT 100`).all(studentId) as Array<Record<string, any>>;
  const fullyCovered=db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN st.complete=1 AND st.error IS NULL THEN 1 ELSE 0 END) AS complete
    FROM (SELECT DISTINCT conversation_id FROM student_conversation_link_history WHERE page_id=? AND student_id=?
      UNION SELECT DISTINCT conversation_id FROM conversation_message_student_links WHERE page_id=? AND student_id=?) l
    LEFT JOIN conversation_sync_state st ON st.page_id=? AND st.conversation_id=l.conversation_id`)
    .get(pageId,studentId,pageId,studentId,pageId) as {total:number;complete:number|null};
  const historyComplete=fullyCovered.total>0&&fullyCovered.total===Number(fullyCovered.complete||0);
  return rows.map((row) => ({ ...row, daysStuck: row.startedAt ? elapsedLocalDays(row.startedAt, row.completedAt || now()) : null,
    durationLabel: row.startedAt ? `${row.status === 'completed' || historyComplete ? '' : 'ít nhất '}${elapsedLocalDays(row.startedAt,row.completedAt || now())} ngày` : 'chưa rõ' }));
}

export function createAssignment(input: { pageId: string; studentId: string; title: string; startedAt?: string; startedSource?: string }) {
  getStudent(input.pageId,input.studentId);
  if(input.startedAt&&!input.startedSource?.trim()) throw new HttpError(400,'Cần ghi căn cứ cho ngày bắt đầu theo dõi bài.','ASSIGNMENT_START_EVIDENCE_REQUIRED');
  const timestamp=now(); const id=uid('asg');
  withTransaction(getDatabase(),()=>{
    getDatabase().prepare(`INSERT INTO student_assignments(id,student_id,title,normalized_title,started_at,started_source,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'active',?,?)`).run(id,input.studentId,input.title.trim(),normalizeTitle(input.title),input.startedAt || null,
        input.startedSource || null,timestamp,timestamp);
    audit(input.studentId,'create','assignment',id,'staff',input);
    touch(input.studentId);
  });
  return { id, items: listAssignments(input.pageId,input.studentId) };
}

export function updateAssignment(input: { pageId: string; studentId: string; assignmentId: string; title?: string; startedAt?: string|null; startedSource?:string|null;
  status?: 'active'|'completed'|'unknown'; completionEvidence?: string; revision?: number }) {
  getStudent(input.pageId,input.studentId);
  const db=getDatabase();
  const current=db.prepare('SELECT * FROM student_assignments WHERE id=? AND student_id=?').get(input.assignmentId,input.studentId) as Record<string,any>|undefined;
  if(!current) throw new HttpError(404,'Không tìm thấy bài tập.','ASSIGNMENT_NOT_FOUND');
  if(input.revision!==undefined && Number(current.revision)!==input.revision) throw new HttpError(409,'Bài tập đã thay đổi. Hãy tải lại.','REVISION_CONFLICT');
  if(input.status==='completed' && !input.completionEvidence?.trim()) throw new HttpError(400,'Cần ghi căn cứ khi xác nhận đã vượt bài.','COMPLETION_EVIDENCE_REQUIRED');
  const nextStartedAt=input.startedAt===undefined?current.started_at:input.startedAt;
  const nextStartedSource=input.startedSource===undefined?current.started_source:input.startedSource;
  const startWasChanged=input.startedAt!==undefined&&input.startedAt!==current.started_at;
  if(nextStartedAt&&!String(nextStartedSource||'').trim()&&(startWasChanged||input.startedSource!==undefined))
    throw new HttpError(400,'Cần ghi căn cứ cho ngày bắt đầu theo dõi bài.','ASSIGNMENT_START_EVIDENCE_REQUIRED');
  const timestamp=now(); const status=input.status || current.status;
  withTransaction(db,()=>{
    const result=db.prepare(`UPDATE student_assignments SET title=?,normalized_title=?,started_at=?,started_source=?,status=?,completed_at=?,completion_evidence=?,revision=revision+1,updated_at=?
      WHERE id=? AND student_id=? AND revision=?`).run(input.title?.trim()||current.title,normalizeTitle(input.title||current.title),
        nextStartedAt,nextStartedAt?nextStartedSource:null,status,status==='completed'?timestamp:null,
        input.completionEvidence ?? current.completion_evidence,timestamp,input.assignmentId,input.studentId,Number(current.revision));
    if(Number(result.changes)!==1) throw new HttpError(409,'Bài tập đã thay đổi. Hãy tải lại.','REVISION_CONFLICT');
    audit(input.studentId,'update','assignment',input.assignmentId,'staff',input);
    touch(input.studentId);
  });
  return { items:listAssignments(input.pageId,input.studentId) };
}

export function listReviewSessions(pageId: string, studentId: string, assignmentId?: string) {
  getStudent(pageId,studentId);
  return getDatabase().prepare(`SELECT r.id,r.student_id AS studentId,r.assignment_id AS assignmentId,a.title AS assignmentTitle,
    r.conversation_id AS conversationId,r.submitted_at AS submittedAt,r.reviewed_at AS reviewedAt,r.teacher_input AS teacherInput,
    r.status,r.confirmed_at AS confirmedAt,r.confirmation_evidence AS confirmationEvidence,
    r.source_message_id AS sourceMessageId,r.client_key AS clientKey,r.created_by AS createdBy,r.created_at AS createdAt
    FROM student_review_sessions r LEFT JOIN student_assignments a ON a.id=r.assignment_id
    WHERE r.student_id=? AND (? IS NULL OR r.assignment_id=?) ORDER BY r.reviewed_at DESC LIMIT 100`).all(studentId,assignmentId||null,assignmentId||null);
}

export function createReviewSession(input: { pageId:string; studentId:string; conversationId:string; assignmentId?:string;
  assignmentTitle?:string; teacherInput:string; submittedAt?:string; sourceMessageId?:string; clientKey?:string; staffId:string }) {
  const clientKey=input.clientKey?.trim();
  if(!clientKey) throw new HttpError(400,'Cần idempotency key cho lượt trả bài.','REVIEW_IDEMPOTENCY_KEY_REQUIRED');
  const linked=getEffectiveMessageStudent(input.pageId,input.conversationId,input.sourceMessageId);
  if(linked!==input.studentId) throw new HttpError(409,'Tin nộp bài thuộc một học viên khác.','STUDENT_LINK_MISMATCH');
  let sourceMessageId:string|undefined;
  let submittedAt:string|undefined;
  if(input.sourceMessageId) {
    const source=getDatabase().prepare(`SELECT created_at AS createdAt FROM conversation_message_cache
      WHERE page_id=? AND conversation_id=? AND message_id=?`).get(input.pageId,input.conversationId,input.sourceMessageId) as {createdAt:string}|undefined;
    if(source) { sourceMessageId=input.sourceMessageId; submittedAt=source.createdAt; }
  }
  const db=getDatabase();
  return withTransaction(db,()=>{
    let assignmentId=input.assignmentId;
    if(assignmentId) {
      const exists=db.prepare('SELECT id FROM student_assignments WHERE id=? AND student_id=?').get(assignmentId,input.studentId);
      if(!exists) throw new HttpError(404,'Bài tập không thuộc học viên này.','ASSIGNMENT_NOT_FOUND');
    } else if(input.assignmentTitle?.trim()) {
      const prior=db.prepare(`SELECT r.id,r.teacher_input AS teacherInput,r.conversation_id AS conversationId,
        r.source_message_id AS sourceMessageId,a.title AS assignmentTitle FROM student_review_sessions r
        LEFT JOIN student_assignments a ON a.id=r.assignment_id WHERE r.student_id=? AND r.client_key=?`)
        .get(input.studentId,clientKey) as {id:string;teacherInput:string;conversationId:string;sourceMessageId:string|null;assignmentTitle:string|null}|undefined;
      if(prior) {
        if(prior.teacherInput!==input.teacherInput.trim()||prior.conversationId!==input.conversationId||
          prior.sourceMessageId!==(sourceMessageId||null)||prior.assignmentTitle!==input.assignmentTitle.trim())
          throw new HttpError(409,'Idempotency key đã được dùng cho một nhận xét khác.','IDEMPOTENCY_KEY_CONFLICT');
        return {id:prior.id,items:listReviewSessions(input.pageId,input.studentId)};
      }
      // A free-text title always starts a new assignment. Existing work must be
      // selected by its ID; titles alone cannot establish identity.
      const created=createAssignment({pageId:input.pageId,studentId:input.studentId,title:input.assignmentTitle});
      assignmentId=created.id;
    }
    const timestamp=now(); const proposedId=uid('review');
    const insert=db.prepare(`INSERT OR IGNORE INTO student_review_sessions(id,student_id,assignment_id,conversation_id,submitted_at,reviewed_at,
      teacher_input,source_message_id,client_key,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(proposedId,input.studentId,assignmentId||null,input.conversationId,submittedAt||null,timestamp,input.teacherInput.trim(),
        sourceMessageId||null,clientKey,input.staffId||'staff',timestamp,timestamp);
    const row=db.prepare(`SELECT id,teacher_input AS teacherInput,assignment_id AS assignmentId,conversation_id AS conversationId,
      source_message_id AS sourceMessageId
      FROM student_review_sessions WHERE student_id=? AND client_key=?`).get(input.studentId,clientKey) as
      {id:string;teacherInput:string;assignmentId:string|null;conversationId:string;sourceMessageId:string|null}|undefined;
    if(!row) throw new Error('Review session idempotency insert did not produce a row.');
    if(row.teacherInput!==input.teacherInput.trim() || row.assignmentId!==(assignmentId||null) || row.conversationId!==input.conversationId ||
      row.sourceMessageId!==(sourceMessageId||null))
      throw new HttpError(409,'Idempotency key đã được dùng cho một nhận xét khác.','IDEMPOTENCY_KEY_CONFLICT');
    if(sourceMessageId) db.prepare(`UPDATE student_submissions SET status='reviewed' WHERE student_id=? AND conversation_id=? AND source_message_id=?`)
      .run(input.studentId,input.conversationId,sourceMessageId);
    if(Number(insert.changes)===1) {
      audit(input.studentId,'create','review_session',row.id,input.staffId,{assignmentId,teacherInput:input.teacherInput});
      touch(input.studentId);
    }
    return {id:row.id,items:listReviewSessions(input.pageId,input.studentId,assignmentId)};
  });
}

export function listSubmissions(pageId:string,studentId:string,status?:'pending'|'reviewed'|'ignored') {
  getStudent(pageId,studentId);
  return getDatabase().prepare(`SELECT s.id,s.assignment_id AS assignmentId,a.title AS assignmentTitle,s.conversation_id AS conversationId,
    s.source_message_id AS sourceMessageId,s.submitted_at AS submittedAt,s.status,s.created_by AS createdBy,s.created_at AS createdAt
    FROM student_submissions s LEFT JOIN student_assignments a ON a.id=s.assignment_id
    WHERE s.student_id=? AND (? IS NULL OR s.status=?) ORDER BY s.submitted_at DESC LIMIT 100`).all(studentId,status||null,status||null);
}

export function createSubmission(input:{pageId:string;studentId:string;conversationId:string;messageId:string;assignmentId?:string;
  assignmentTitle?:string;submittedAt?:string;staffId:string}) {
  const sourceStudent=getEffectiveMessageStudent(input.pageId,input.conversationId,input.messageId);
  if(sourceStudent!==input.studentId) throw new HttpError(409,'Tin nộp bài thuộc một học viên khác.','STUDENT_LINK_MISMATCH');
  const db=getDatabase();
  return withTransaction(db,()=>{
    const message=db.prepare(`SELECT created_at AS createdAt FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?`)
      .get(input.pageId,input.conversationId,input.messageId) as {createdAt:string}|undefined;
    if(!message) throw new HttpError(404,'Không tìm thấy tin nhắn đã đồng bộ để gắn bài nộp.','SOURCE_MESSAGE_NOT_FOUND');
    let assignmentId=input.assignmentId;
    if(assignmentId && !db.prepare('SELECT id FROM student_assignments WHERE id=? AND student_id=?').get(assignmentId,input.studentId))
      throw new HttpError(404,'Bài tập không thuộc học viên này.','ASSIGNMENT_NOT_FOUND');
    if(!assignmentId && input.assignmentTitle?.trim()) {
      const normalized=normalizeTitle(input.assignmentTitle);
      const found=db.prepare(`SELECT id FROM student_assignments WHERE student_id=? AND normalized_title=? AND status='active' LIMIT 1`)
        .get(input.studentId,normalized) as {id:string}|undefined;
      if(found) assignmentId=found.id;
      else {
        createAssignment({pageId:input.pageId,studentId:input.studentId,title:input.assignmentTitle});
        assignmentId=(db.prepare('SELECT id FROM student_assignments WHERE student_id=? AND normalized_title=? AND status=\'active\' ORDER BY created_at DESC LIMIT 1')
          .get(input.studentId,normalized) as {id:string}).id;
      }
    }
    db.prepare(`INSERT OR IGNORE INTO student_submissions(id,student_id,assignment_id,conversation_id,source_message_id,submitted_at,status,created_by,created_at)
      VALUES (?,?,?,?,?,?,'pending',?,?)`).run(uid('submission'),input.studentId,assignmentId||null,input.conversationId,input.messageId,
        input.submittedAt||message.createdAt,input.staffId||'staff',now());
    const row=db.prepare('SELECT id FROM student_submissions WHERE student_id=? AND conversation_id=? AND source_message_id=?')
      .get(input.studentId,input.conversationId,input.messageId) as {id:string}|undefined;
    if(!row) throw new Error('Submission insert did not produce a row.');
    audit(input.studentId,'record_submission','submission',row.id,input.staffId,input);
    touch(input.studentId);
    return listSubmissions(input.pageId,input.studentId);
  });
}

export function updateSubmission(input:{pageId:string;studentId:string;submissionId:string;status:'pending'|'reviewed'|'ignored';staffId:string}) {
  getStudent(input.pageId,input.studentId);
  withTransaction(getDatabase(),()=>{
    const result=getDatabase().prepare('UPDATE student_submissions SET status=? WHERE id=? AND student_id=?')
      .run(input.status,input.submissionId,input.studentId);
    if(Number(result.changes)!==1) throw new HttpError(404,'Không tìm thấy bài nộp.','SUBMISSION_NOT_FOUND');
    audit(input.studentId,'update','submission',input.submissionId,input.staffId,{status:input.status});
    touch(input.studentId);
  });
  return listSubmissions(input.pageId,input.studentId);
}

export function confirmReviewSession(input:{pageId:string;studentId:string;reviewSessionId:string;staffId:string;confirmed:boolean;evidence?:string}) {
  getStudent(input.pageId,input.studentId);
  const db=getDatabase();
  withTransaction(db,()=>{
    const result=db.prepare(`UPDATE student_review_sessions SET status=?,confirmed_at=?,confirmation_evidence=?,updated_at=?
      WHERE id=? AND student_id=?`).run(input.confirmed?'confirmed':'cancelled',input.confirmed?now():null,
        input.confirmed?(input.evidence||'Nhân viên xác nhận đã gửi nhận xét.'):'',now(),input.reviewSessionId,input.studentId);
    if(Number(result.changes)!==1) throw new HttpError(404,'Không tìm thấy lượt trả bài.','REVIEW_SESSION_NOT_FOUND');
    audit(input.studentId,input.confirmed?'confirm':'cancel','review_session',input.reviewSessionId,input.staffId,{evidence:input.evidence});
    touch(input.studentId);
  });
  return listReviewSessions(input.pageId,input.studentId);
}

export function listIssues(pageId:string,studentId:string,view:IssueView='all',limit=50,offset=0) {
  getStudent(pageId,studentId);
  const filter=view==='unresolved'?"AND i.status IN ('active','needs_verification','recurred')":'';
  const order=view==='recent'?'i.last_occurred_at DESC,i.updated_at DESC':'i.last_occurred_at DESC,i.title COLLATE NOCASE';
  const rows=getDatabase().prepare(`SELECT i.id,i.title,i.summary,i.status,i.first_occurred_at AS firstOccurredAt,
    i.last_occurred_at AS lastOccurredAt,i.resolved_at AS resolvedAt,i.revision,i.created_at AS createdAt,
    (SELECT COUNT(*) FROM issue_occurrences o WHERE o.issue_id=i.id AND o.approved=1) AS occurrenceCount,
    (SELECT COUNT(DISTINCT COALESCE(o.review_session_id,e.review_session_id)) FROM issue_occurrences o
      LEFT JOIN issue_evidence e ON e.occurrence_id=o.id
      JOIN student_review_sessions r ON r.id=COALESCE(o.review_session_id,e.review_session_id)
      WHERE o.issue_id=i.id AND o.approved=1 AND r.status='confirmed') AS reviewSessionCount,
    (SELECT COUNT(DISTINCT e.conversation_id || ':' || e.message_id) FROM issue_evidence e
      JOIN issue_occurrences o ON o.id=e.occurrence_id WHERE o.issue_id=i.id AND e.message_id IS NOT NULL) AS messageMentionCount,
    (SELECT o.source_kind FROM issue_occurrences o WHERE o.issue_id=i.id ORDER BY o.occurred_at DESC LIMIT 1) AS latestSourceKind,
    (SELECT a.content FROM issue_practice_actions a WHERE a.issue_id=i.id ORDER BY a.created_at DESC LIMIT 1) AS latestPracticeAction,
    (SELECT a.created_at FROM issue_practice_actions a WHERE a.issue_id=i.id ORDER BY a.created_at DESC LIMIT 1) AS latestPracticeAt
    FROM student_issues i WHERE i.student_id=? ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`).all(studentId,limit,offset) as Array<Record<string,any>>;
  return {view,items:rows,limit,offset};
}

export function getIssueDetail(pageId:string,studentId:string,issueId:string,limit=50,offset=0) {
  getStudent(pageId,studentId);
  const issue=getDatabase().prepare(`SELECT * FROM student_issues WHERE id=? AND student_id=?`).get(issueId,studentId) as Record<string,any>|undefined;
  if(!issue) throw new HttpError(404,'Không tìm thấy lỗi kỹ thuật.','ISSUE_NOT_FOUND');
  const occurrences=getDatabase().prepare(`SELECT o.id,o.assignment_id AS assignmentId,a.title AS assignmentTitle,
    o.review_session_id AS reviewSessionId,o.occurred_at AS occurredAt,o.source_kind AS sourceKind,o.approved,o.revision,
    (SELECT COUNT(*) FROM issue_evidence e WHERE e.occurrence_id=o.id) AS evidenceCount
    FROM issue_occurrences o LEFT JOIN student_assignments a ON a.id=o.assignment_id
    WHERE o.issue_id=? ORDER BY o.occurred_at DESC LIMIT ? OFFSET ?`).all(issueId,limit,offset) as Array<Record<string,any>>;
  const evidence=getDatabase().prepare(`SELECT e.id,e.occurrence_id AS occurrenceId,e.conversation_id AS conversationId,
    e.message_id AS messageId,e.review_session_id AS reviewSessionId,e.speaker,e.verbatim_text AS verbatimText,
    e.occurred_at AS occurredAt,r.teacher_input AS teacherInput
    FROM issue_evidence e LEFT JOIN student_review_sessions r ON r.id=e.review_session_id
    JOIN issue_occurrences o ON o.id=e.occurrence_id WHERE o.issue_id=? ORDER BY e.occurred_at DESC LIMIT ? OFFSET ?`)
    .all(issueId,limit*5,offset*5);
  const actions=getDatabase().prepare(`SELECT id,content,review_session_id AS reviewSessionId,source_message_id AS sourceMessageId,
    created_by AS createdBy,created_at AS createdAt FROM issue_practice_actions WHERE issue_id=? ORDER BY created_at DESC LIMIT 50`).all(issueId);
  return {issue,occurrences,evidence,practiceActions:actions,limit,offset,hasMore:occurrences.length===limit};
}

export function addIssueOccurrence(input: { pageId:string;studentId:string;staffId:string;issueId?:string;title?:string;summary?:string;
  assignmentId?:string;reviewSessionId?:string;occurredAt:string;sourceKind:'teacher_confirmed'|'student_reported'|'staff_confirmed';
  conversationId?:string;messageId?:string;reviewSessionIdForEvidence?:string;speaker:string;verbatimText:string;practiceAction?:string;sourceKey?:string }) {
  getStudent(input.pageId,input.studentId);
  const evidence=resolveOccurrenceEvidence({pageId:input.pageId,studentId:input.studentId,conversationId:input.conversationId,
    messageId:input.messageId,reviewSessionId:input.reviewSessionIdForEvidence,sourceKind:input.sourceKind,
    speaker:input.speaker,verbatimText:input.verbatimText,practiceAction:input.practiceAction});
  const db=getDatabase(); const timestamp=now(); const occurrenceId=uid('occ');
  return withTransaction(db,()=>{
  let issueId=input.issueId;
  if(issueId) {
    const exists=db.prepare('SELECT id FROM student_issues WHERE id=? AND student_id=?').get(issueId,input.studentId);
    if(!exists) throw new HttpError(404,'Lỗi không thuộc hồ sơ học viên.','ISSUE_NOT_FOUND');
  } else {
    const title=input.title?.trim();
    if(!title) throw new HttpError(400,'Cần chọn lỗi hoặc nhập tên lỗi mới.','ISSUE_TITLE_REQUIRED');
    const normalized=normalizeTitle(title);
    const existing=db.prepare('SELECT id FROM student_issues WHERE student_id=? AND normalized_title=?').get(input.studentId,normalized) as {id:string}|undefined;
    issueId=existing?.id || uid('issue');
    if(!existing) db.prepare(`INSERT INTO student_issues(id,student_id,title,normalized_title,summary,status,first_occurred_at,last_occurred_at,revision,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,?,?)`).run(issueId,input.studentId,title,normalized,input.summary||'',input.sourceKind==='student_reported'?'needs_verification':'active',
        input.occurredAt,input.occurredAt,timestamp,timestamp);
  }
  if(input.assignmentId && !db.prepare('SELECT id FROM student_assignments WHERE id=? AND student_id=?').get(input.assignmentId,input.studentId))
    throw new HttpError(404,'Bài tập không thuộc học viên này.','ASSIGNMENT_NOT_FOUND');
  if(input.reviewSessionId && !db.prepare('SELECT id FROM student_review_sessions WHERE id=? AND student_id=?').get(input.reviewSessionId,input.studentId))
    throw new HttpError(404,'Lượt trả bài không thuộc học viên này.','REVIEW_SESSION_NOT_FOUND');
  // A source message is canonical for this issue even if callers supply
  // different source keys on retry. Review sessions similarly group messages
  // describing one grading occasion.
  const sourceKey=input.reviewSessionId?`review:${input.reviewSessionId}`:
    evidence.reviewSessionId?`review:${evidence.reviewSessionId}`:`message:${evidence.conversationId}:${evidence.messageId}`;
  const sourceGroupKey=!input.reviewSessionId&&!evidence.reviewSessionId?input.sourceKey?.trim()||null:null;
  let existingOccurrence: {id:string}|undefined;
  if(evidence.conversationId&&evidence.messageId) existingOccurrence=db.prepare(`SELECT o.id FROM issue_occurrences o JOIN issue_evidence e ON e.occurrence_id=o.id
    WHERE o.issue_id=? AND e.conversation_id=? AND e.message_id=? LIMIT 1`).get(issueId,evidence.conversationId,evidence.messageId) as {id:string}|undefined;
  if(!existingOccurrence&&evidence.reviewSessionId) existingOccurrence=db.prepare(`SELECT id FROM issue_occurrences
    WHERE issue_id=? AND review_session_id=? LIMIT 1`).get(issueId,evidence.reviewSessionId) as {id:string}|undefined;
  if(!existingOccurrence) existingOccurrence=db.prepare('SELECT id FROM issue_occurrences WHERE issue_id=? AND source_key=?')
    .get(issueId,sourceKey) as {id:string}|undefined;
  if(!existingOccurrence && input.reviewSessionId) existingOccurrence=db.prepare('SELECT id FROM issue_occurrences WHERE issue_id=? AND review_session_id=?').get(issueId,input.reviewSessionId) as {id:string}|undefined;
  // A caller's group key is only a hint. Both messages must be independently
  // attributed to this student and close in trusted message time and reported take time.
  if(!existingOccurrence&&sourceGroupKey&&evidence.conversationId&&evidence.messageCreatedAt) {
    const candidates=db.prepare(`SELECT o.id,o.occurred_at AS occurredAt,o.assignment_id AS assignmentId,
      o.source_kind AS sourceKind,m.created_at AS messageCreatedAt
      FROM issue_occurrences o JOIN issue_evidence e ON e.occurrence_id=o.id
      JOIN conversation_message_cache m ON m.page_id=? AND m.conversation_id=e.conversation_id AND m.message_id=e.message_id
      WHERE o.issue_id=? AND o.source_group_key=? AND e.conversation_id=?
        AND o.source_key=('message:' || e.conversation_id || ':' || e.message_id)
      ORDER BY o.occurred_at DESC LIMIT 100`)
      .all(input.pageId,issueId,sourceGroupKey,evidence.conversationId) as Array<{
        id:string;occurredAt:string;assignmentId:string|null;sourceKind:string;messageCreatedAt:string}>;
    const messageTime=Date.parse(evidence.messageCreatedAt);
    existingOccurrence=candidates.find((candidate)=>candidate.assignmentId===(input.assignmentId||null)&&
      candidate.sourceKind===input.sourceKind&&
      candidate.occurredAt===input.occurredAt&&
      Math.abs(Date.parse(candidate.messageCreatedAt)-messageTime)<=15*60_000);
  }
  const actualOccurrenceId=existingOccurrence?.id || occurrenceId;
  if(!existingOccurrence) db.prepare(`INSERT INTO issue_occurrences(id,issue_id,assignment_id,review_session_id,occurred_at,source_kind,approved,source_key,source_group_key,created_by,created_at)
    VALUES (?,?,?,?,?,?,1,?,?,?,?)`).run(actualOccurrenceId,issueId,input.assignmentId||null,input.reviewSessionId||null,input.occurredAt,
      input.sourceKind,sourceKey||null,sourceGroupKey,input.staffId||'staff',timestamp);
  db.prepare(`INSERT OR IGNORE INTO issue_evidence(id,occurrence_id,issue_id,conversation_id,message_id,review_session_id,speaker,verbatim_text,occurred_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(uid('evidence'),actualOccurrenceId,issueId,evidence.conversationId||null,evidence.messageId||null,
      evidence.reviewSessionId||null,evidence.speaker,evidence.verbatimText,input.occurredAt,timestamp);
  if(input.practiceAction?.trim()&&evidence.teacherConfirmed) {
    const sourceAction=evidence.reviewSessionId
      ?db.prepare('SELECT id FROM issue_practice_actions WHERE issue_id=? AND review_session_id=? LIMIT 1').get(issueId,evidence.reviewSessionId)
      :evidence.teacherMessageId?db.prepare(`SELECT id FROM issue_practice_actions WHERE issue_id=? AND source_message_id=? LIMIT 1`)
        .get(issueId,evidence.teacherMessageId):undefined;
    if(!sourceAction) db.prepare(`INSERT INTO issue_practice_actions(id,issue_id,content,review_session_id,source_message_id,created_by,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(uid('action'),issueId,input.practiceAction.trim(),evidence.reviewSessionId||null,
        evidence.teacherMessageId||null,input.staffId||'staff',timestamp);
  }
  const current=db.prepare('SELECT status,summary FROM student_issues WHERE id=?').get(issueId) as {status:string;summary:string};
  if(existingOccurrence) return {issueId,occurrenceId:actualOccurrenceId,issues:listIssues(input.pageId,input.studentId,'all').items};
  const nextStatus=current.status==='resolved'?'recurred':current.status==='needs_verification'&&input.sourceKind!=='student_reported'?'active':current.status;
  db.prepare(`UPDATE student_issues SET summary=?,status=?,first_occurred_at=MIN(COALESCE(first_occurred_at,?),?),
    last_occurred_at=MAX(COALESCE(last_occurred_at,?),?),revision=revision+1,updated_at=? WHERE id=?`)
    .run(input.summary??current.summary,nextStatus,input.occurredAt,input.occurredAt,input.occurredAt,input.occurredAt,timestamp,issueId);
  audit(input.studentId,'confirm_occurrence','issue_occurrence',actualOccurrenceId,input.staffId,{sourceKind:input.sourceKind,sourceKey});
  touch(input.studentId);
  return {issueId,occurrenceId:actualOccurrenceId,issues:listIssues(input.pageId,input.studentId,'all').items};
  });
}

function resolveOccurrenceEvidence(input:{pageId:string;studentId:string;conversationId?:string;messageId?:string;reviewSessionId?:string;
  sourceKind:'teacher_confirmed'|'student_reported'|'staff_confirmed';speaker?:string;verbatimText:string;practiceAction?:string}) {
  if(Boolean(input.conversationId)!==Boolean(input.messageId))
    throw new HttpError(400,'Nguồn tin nhắn cần cả conversationId và messageId.','SOURCE_CONVERSATION_REQUIRED');
  if(!input.messageId&&!input.reviewSessionId)
    throw new HttpError(400,'Cần nguồn tin nhắn hoặc lượt trả bài đã xác nhận.','SOURCE_REQUIRED');
  let message:ReturnType<typeof getCachedMessage>|undefined;
  let review:{id:string;teacherInput:string;conversationId:string|null}|undefined;
  if(input.messageId&&input.conversationId) {
    if(getEffectiveMessageStudent(input.pageId,input.conversationId,input.messageId)!==input.studentId)
      throw new HttpError(409,'Tin nhắn nguồn thuộc một học viên khác.','STUDENT_LINK_MISMATCH');
    message=getCachedMessage(input.pageId,input.conversationId,input.messageId);
  }
  if(input.reviewSessionId) {
    review=getDatabase().prepare(`SELECT id,teacher_input AS teacherInput,conversation_id AS conversationId
      FROM student_review_sessions WHERE id=? AND student_id=? AND status='confirmed'`)
      .get(input.reviewSessionId,input.studentId) as typeof review;
    if(!review) throw new HttpError(409,'Lượt trả bài nguồn chưa được xác nhận hoặc không thuộc học viên.','REVIEW_SOURCE_INVALID');
  }
  const quote=input.verbatimText.trim();
  const matchesMessage=Boolean(message?.text.includes(quote));
  const matchesReview=Boolean(review?.teacherInput.includes(quote));
  if(!matchesMessage&&!matchesReview)
    throw new HttpError(400,'Trích dẫn phải khớp nguyên văn tin nhắn hoặc nhận xét giáo viên đã xác nhận.','SOURCE_QUOTE_MISMATCH');
  const expectedSpeaker=matchesMessage
    ? message!.senderName||(message!.sender==='student'?'Học viên':'Giáo viên/nhân viên')
    : 'Teacher';
  if(input.speaker?.trim()&&input.speaker.trim()!==expectedSpeaker)
    throw new HttpError(400,'Người nói phải khớp nguồn đã lưu.','SOURCE_SPEAKER_MISMATCH');
  const teacherQuote=Boolean((matchesMessage&&message?.sender==='staff')||matchesReview);
  const studentQuote=Boolean(matchesMessage&&message?.sender==='student');
  if(input.sourceKind==='teacher_confirmed'&&!teacherQuote)
    throw new HttpError(400,'Teacher-confirmed cần trích dẫn từ tin giáo viên hoặc lượt trả bài đã xác nhận.','SOURCE_KIND_SENDER_MISMATCH');
  if(input.sourceKind==='student_reported'&&!studentQuote)
    throw new HttpError(400,'Student-reported cần trích dẫn từ tin nhắn học viên.','SOURCE_KIND_SENDER_MISMATCH');
  if(input.practiceAction?.trim()&&(input.sourceKind!=='teacher_confirmed'||!teacherQuote))
    throw new HttpError(400,'Cách sửa chỉ được lưu khi trích dẫn thuộc nguồn giáo viên đã xác nhận.','PRACTICE_ACTION_SOURCE_UNVERIFIED');
  if(input.practiceAction?.trim()) {
    const action=input.practiceAction.trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
    const teacherSources=[
      matchesMessage&&message?.sender==='staff'?message.text:undefined,
      matchesReview?review?.teacherInput:undefined
    ].filter((value):value is string=>Boolean(value));
    if(!teacherSources.some((source)=>source.replace(/\s+/g,' ').toLocaleLowerCase('vi').includes(action)))
      throw new HttpError(400,'Cách sửa phải có nguyên văn trong nguồn giáo viên đã xác nhận.','PRACTICE_ACTION_QUOTE_MISMATCH');
  }
  return {
    conversationId:input.conversationId,
    messageId:input.messageId,
    reviewSessionId:input.reviewSessionId,
    speaker:expectedSpeaker,
    verbatimText:quote,
    sender:matchesMessage?message!.sender:'staff',
    teacherConfirmed:teacherQuote,
    messageCreatedAt:message?.createdAt,
    teacherMessageId:teacherQuote&&matchesMessage&&message?.sender==='staff'?input.messageId:undefined
  };
}

function hasExistingOccurrenceSource(db:ReturnType<typeof getDatabase>,pageId:string,studentId:string,occurrenceId:string,
  sourceKind:'teacher_confirmed'|'student_reported'|'staff_confirmed',newEvidence?:ReturnType<typeof resolveOccurrenceEvidence>) {
  const rows=db.prepare(`SELECT e.conversation_id AS conversationId,e.message_id AS messageId,e.review_session_id AS reviewSessionId,
      e.verbatim_text AS quote,m.sender,m.text AS messageText,r.student_id AS reviewStudentId,r.status AS reviewStatus,r.teacher_input AS teacherInput
    FROM issue_evidence e
    LEFT JOIN conversation_message_cache m ON m.page_id=? AND m.conversation_id=e.conversation_id AND m.message_id=e.message_id
    LEFT JOIN student_review_sessions r ON r.id=e.review_session_id
    WHERE e.occurrence_id=?`).all(pageId,occurrenceId) as Array<{conversationId:string|null;messageId:string|null;
      reviewSessionId:string|null;quote:string;sender:string|null;messageText:string|null;reviewStudentId:string|null;reviewStatus:string|null;teacherInput:string|null}>;
  if(newEvidence) rows.push({conversationId:newEvidence.conversationId||null,messageId:newEvidence.messageId||null,
    reviewSessionId:newEvidence.reviewSessionId||null,quote:newEvidence.verbatimText,
    sender:newEvidence.sender,
    reviewStudentId:newEvidence.reviewSessionId?studentId:null,reviewStatus:newEvidence.reviewSessionId?'confirmed':null,
    messageText:newEvidence.messageId?newEvidence.verbatimText:null,
    teacherInput:newEvidence.reviewSessionId?newEvidence.verbatimText:null});
  const validMessage=(row:typeof rows[number])=>Boolean(row.conversationId&&row.messageId&&row.sender&&row.messageText?.includes(row.quote));
  const validReview=(row:typeof rows[number])=>Boolean(row.reviewSessionId&&row.reviewStudentId===studentId&&row.reviewStatus==='confirmed'&&row.teacherInput?.includes(row.quote));
  const teacherEvidence=rows.some((row)=>(validMessage(row)&&row.sender==='staff')||validReview(row));
  const studentEvidence=rows.some((row)=>validMessage(row)&&row.sender==='student');
  const anyEvidence=rows.some((row)=>validMessage(row)||validReview(row));
  if(sourceKind==='teacher_confirmed') return teacherEvidence;
  if(sourceKind==='student_reported') return studentEvidence;
  return anyEvidence;
}

export function updateIssue(input: { pageId:string;studentId:string;issueId:string;revision:number;staffId:string;title?:string;summary?:string;
  status?:'active'|'needs_verification'|'resolved'|'recurred';statusEvidence?:string }) {
  getStudent(input.pageId,input.studentId);
  const db=getDatabase(); const current=db.prepare('SELECT * FROM student_issues WHERE id=? AND student_id=?').get(input.issueId,input.studentId) as Record<string,any>|undefined;
  if(!current) throw new HttpError(404,'Không tìm thấy lỗi kỹ thuật.','ISSUE_NOT_FOUND');
  if(Number(current.revision)!==input.revision) throw new HttpError(409,'Hồ sơ lỗi đã thay đổi. Hãy tải lại.','REVISION_CONFLICT');
  if(input.status&&input.status!==current.status&&!input.statusEvidence?.trim())
    throw new HttpError(400,'Cần căn cứ cho thay đổi trạng thái lỗi.','ISSUE_STATUS_EVIDENCE_REQUIRED');
  return withTransaction(db,()=>{
  const title=input.title?.trim()||String(current.title); const status=input.status||current.status; const timestamp=now();
  const result=db.prepare(`UPDATE student_issues SET title=?,normalized_title=?,summary=?,status=?,resolved_at=?,revision=revision+1,updated_at=?
    WHERE id=? AND student_id=? AND revision=?`).run(title,normalizeTitle(title),input.summary??current.summary,status,
      status==='resolved'?timestamp:null,timestamp,input.issueId,input.studentId,Number(current.revision));
  if(Number(result.changes)!==1) throw new HttpError(409,'Hồ sơ lỗi đã thay đổi. Hãy tải lại.','REVISION_CONFLICT');
  if(input.status && input.status!==current.status) {
    db.prepare('INSERT INTO issue_status_events(id,issue_id,status,evidence_text,changed_by,created_at) VALUES (?,?,?,?,?,?)')
      .run(uid('status'),input.issueId,status,input.statusEvidence||'',input.staffId||'staff',timestamp);
  }
  audit(input.studentId,'update','issue',input.issueId,input.staffId,input);
  touch(input.studentId);
  return {items:listIssues(input.pageId,input.studentId,'all').items};
  });
}

export function updateOccurrence(input: { pageId:string;studentId:string;issueId:string;occurrenceId:string;revision:number;staffId:string;
  occurredAt?:string;sourceKind?:'teacher_confirmed'|'student_reported'|'staff_confirmed';approved?:boolean;targetIssueId?:string;targetIssueTitle?:string;
  evidenceText?:string;speaker?:string;evidenceConversationId?:string;evidenceMessageId?:string;evidenceReviewSessionId?:string }) {
  getStudent(input.pageId,input.studentId); const db=getDatabase();
  const row=db.prepare(`SELECT o.* FROM issue_occurrences o JOIN student_issues i ON i.id=o.issue_id
    WHERE o.id=? AND o.issue_id=? AND i.student_id=?`).get(input.occurrenceId,input.issueId,input.studentId) as Record<string,any>|undefined;
  if(!row) throw new HttpError(404,'Không tìm thấy lần xuất hiện.','OCCURRENCE_NOT_FOUND');
  if(Number(row.revision)!==input.revision) throw new HttpError(409,'Lần xuất hiện đã thay đổi. Hãy tải lại.','REVISION_CONFLICT');
  const hasNewEvidence=Boolean(input.evidenceConversationId||input.evidenceMessageId||input.evidenceReviewSessionId||input.evidenceText?.trim());
  let newEvidence:ReturnType<typeof resolveOccurrenceEvidence>|undefined;
  if(hasNewEvidence) {
    let quote=input.evidenceText?.trim();
    let speaker=input.speaker?.trim();
    if(!quote&&input.evidenceMessageId&&input.evidenceConversationId) {
      const source=getCachedMessage(input.pageId,input.evidenceConversationId,input.evidenceMessageId);
      quote=source.text;
      speaker=speaker||source.senderName||(source.sender==='student'?'Học viên':'Giáo viên/nhân viên');
    } else if(!quote&&input.evidenceReviewSessionId) {
      const source=db.prepare(`SELECT teacher_input AS teacherInput FROM student_review_sessions WHERE id=? AND student_id=? AND status='confirmed'`)
        .get(input.evidenceReviewSessionId,input.studentId) as {teacherInput:string}|undefined;
      if(!source) throw new HttpError(409,'Lượt trả bài nguồn chưa được xác nhận hoặc không thuộc học viên.','REVIEW_SOURCE_INVALID');
      quote=source.teacherInput;
      speaker=speaker||'Teacher';
    }
    if(!quote) throw new HttpError(400,'Cần trích dẫn evidence từ nguồn đã lưu.','SOURCE_QUOTE_REQUIRED');
    newEvidence=resolveOccurrenceEvidence({pageId:input.pageId,studentId:input.studentId,conversationId:input.evidenceConversationId,
      messageId:input.evidenceMessageId,reviewSessionId:input.evidenceReviewSessionId,
      sourceKind:input.sourceKind||'staff_confirmed',speaker:speaker||'',verbatimText:quote});
  } else if(input.evidenceText?.trim()) {
    throw new HttpError(400,'Evidence cần gắn với tin nhắn hoặc lượt trả bài nguồn.','SOURCE_REQUIRED');
  }
  const targetSourceKind=input.sourceKind||String(row.source_kind) as 'teacher_confirmed'|'student_reported'|'staff_confirmed';
  if(!hasExistingOccurrenceSource(db,input.pageId,input.studentId,input.occurrenceId,targetSourceKind,newEvidence))
    throw new HttpError(400,'Không thể xác nhận loại nguồn khi occurrence chưa có provenance tương ứng.','SOURCE_KIND_PROVENANCE_REQUIRED');
  return withTransaction(db,()=>{
  let targetIssueId=input.targetIssueId;
  if(input.targetIssueTitle?.trim()&&!targetIssueId) {
    const title=input.targetIssueTitle.trim();
    const found=db.prepare('SELECT id FROM student_issues WHERE student_id=? AND normalized_title=?')
      .get(input.studentId,normalizeTitle(title)) as {id:string}|undefined;
    targetIssueId=found?.id||uid('issue');
    if(!found) db.prepare(`INSERT INTO student_issues(id,student_id,title,normalized_title,summary,status,first_occurred_at,last_occurred_at,revision,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,?,?)`).run(targetIssueId,input.studentId,title,normalizeTitle(title),
        'Tách từ một lần xuất hiện đã được nhân viên rà soát.',row.source_kind==='student_reported'?'needs_verification':'active',
        row.occurred_at,row.occurred_at,now(),now());
  }
  if(targetIssueId===input.issueId) throw new HttpError(400,'Lỗi đích trùng với lỗi hiện tại. Hãy nhập tên lỗi khác.','ISSUE_TARGET_SAME');
  if(targetIssueId) {
    const target=db.prepare('SELECT id FROM student_issues WHERE id=? AND student_id=?').get(targetIssueId,input.studentId);
    if(!target) throw new HttpError(404,'Lỗi đích không thuộc học viên này.','ISSUE_NOT_FOUND');
    const moved=db.prepare('UPDATE issue_occurrences SET issue_id=?,revision=revision+1 WHERE id=? AND revision=?')
      .run(targetIssueId,input.occurrenceId,Number(row.revision));
    if(Number(moved.changes)!==1) throw new HttpError(409,'Lần xuất hiện đã thay đổi. Hãy tải lại.','REVISION_CONFLICT');
  } else {
    const changed=db.prepare(`UPDATE issue_occurrences SET occurred_at=COALESCE(?,occurred_at),source_kind=COALESCE(?,source_kind),
      approved=COALESCE(?,approved),revision=revision+1 WHERE id=? AND revision=?`).run(input.occurredAt||null,input.sourceKind||null,
        input.approved===undefined?null:input.approved?1:0,input.occurrenceId,Number(row.revision));
    if(Number(changed.changes)!==1) throw new HttpError(409,'Lần xuất hiện đã thay đổi. Hãy tải lại.','REVISION_CONFLICT');
  }
  if(newEvidence) {
    const evidenceIssueId=targetIssueId||input.issueId;
    const evidenceAt=newEvidence.messageId&&newEvidence.conversationId
      ?getCachedMessage(input.pageId,newEvidence.conversationId,newEvidence.messageId).createdAt:input.occurredAt||row.occurred_at;
    db.prepare(`INSERT OR IGNORE INTO issue_evidence(id,occurrence_id,issue_id,conversation_id,message_id,review_session_id,speaker,verbatim_text,occurred_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(uid('evidence'),input.occurrenceId,evidenceIssueId,newEvidence.conversationId||null,
        newEvidence.messageId||null,newEvidence.reviewSessionId||null,newEvidence.speaker,newEvidence.verbatimText,evidenceAt,now());
  }
  refreshIssueTimeline(input.issueId);
  if(targetIssueId&&targetIssueId!==input.issueId) refreshIssueTimeline(targetIssueId);
  audit(input.studentId,targetIssueId&&targetIssueId!==input.issueId?(input.targetIssueTitle?'split_occurrence':'merge_occurrence'):'update',
    'issue_occurrence',input.occurrenceId,input.staffId,input);
  touch(input.studentId);
  return getIssueDetail(input.pageId,input.studentId,targetIssueId||input.issueId,50,0);
  });
}

function refreshIssueTimeline(issueId:string) {
  getDatabase().prepare(`UPDATE student_issues SET first_occurred_at=(SELECT MIN(occurred_at) FROM issue_occurrences WHERE issue_id=? AND approved=1),
    last_occurred_at=(SELECT MAX(occurred_at) FROM issue_occurrences WHERE issue_id=? AND approved=1),
    status=CASE WHEN EXISTS(SELECT 1 FROM issue_occurrences WHERE issue_id=? AND approved=1) THEN status ELSE 'needs_verification' END,
    revision=revision+1,updated_at=? WHERE id=?`).run(issueId,issueId,issueId,now(),issueId);
}

function elapsedLocalDays(start:string,end:string) {
  const date=(value:string) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const toUtc=(value:string) => { const [year,month,day]=value.split('-').map(Number); return Date.UTC(year||1970,(month||1)-1,day||1); };
  return Math.max(0,Math.floor((toUtc(date(end))-toUtc(date(start)))/86400000));
}

function inferConflictKey(kind:'preference'|'event'|'learning_note',content:string):string|undefined {
  if(kind!=='preference') return undefined;
  const normalized=normalizeTitle(content);
  if(/\b(goi la|goi em la|goi toi la|hay goi|muon duoc goi|xung ho|ten goi|cach goi|call me|prefer to be called|preferred name)\b/.test(normalized)) return 'preferred_name';
  return undefined;
}

function refreshFactConflict(studentId:string,conflictKey:string,timestamp:string) {
  const db=getDatabase();
  const rows=db.prepare(`SELECT id,content FROM student_facts WHERE student_id=? AND conflict_key=? AND status='active'`)
    .all(studentId,conflictKey) as Array<{id:string;content:string}>;
  const hasConflict=new Set(rows.map((row)=>row.content)).size>1;
  if(hasConflict) {
    db.prepare(`UPDATE student_facts SET conflict_status='pending',use_in_suggestions=0,updated_at=?
      WHERE student_id=? AND conflict_key=? AND status='active'`).run(timestamp,studentId,conflictKey);
    return;
  }
  db.prepare(`UPDATE student_facts SET conflict_status='none',
      use_in_suggestions=CASE WHEN use_requested=1 AND sensitivity='normal' AND verification_status='confirmed' THEN 1 ELSE 0 END,
      updated_at=? WHERE student_id=? AND conflict_key=? AND status='active'`)
    .run(timestamp,studentId,conflictKey);
}

function audit(studentId:string,action:string,entityType:string,entityId:string,staffId:string,payload:unknown) {
  getDatabase().prepare(`INSERT INTO student_audit_events(id,student_id,action,entity_type,entity_id,changed_by,payload_json,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(uid('audit'),studentId,action,entityType,entityId,staffId||'staff',JSON.stringify(payload),now());
}

function touch(studentId:string) {
  const timestamp=now();
  getDatabase().prepare('UPDATE students SET revision=revision+1,updated_at=? WHERE id=?').run(timestamp,studentId);
  getDatabase().prepare('DELETE FROM student_summary_snapshots WHERE student_id=?').run(studentId);
}
