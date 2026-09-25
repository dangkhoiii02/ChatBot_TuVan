import { resolveAI } from '../../../shared/ai-provider.cjs';
import { HttpError } from '../utils/httpError.js';
import { Router } from 'express';
import { z } from 'zod';
import { createSuggestions } from '../services/suggestionService.js';
import { resolveReplyContext } from '../services/replyContextService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { filterMessagesForStudent, getConversationIdentity, getEffectiveMessageStudent, getLatestStudentMessageForStudent, getCachedMessage, getStudent } from '../services/studentIdentityService.js';
import { createReviewSession, getStudentSummary, listReviewSessions } from '../services/studentLearningService.js';
import { getDatabase } from '../db/index.js';
import { formatStudentContext } from '../services/promptStudentContext.js';

export const suggestionsRouter = Router();

const suggestionRequestSchema = z.object({
  conversationId: z.string().min(1),
  studentId: z.string().trim().min(1).max(200).optional(),
  contextRevision: z.number().int().nonnegative().optional(),
  assignmentId: z.string().trim().min(1).max(200).optional(),
  assignmentTitle: z.string().trim().min(1).max(200).optional(),
  reviewSessionId: z.string().trim().min(1).max(200).optional(),
  reviewSessionKey: z.string().trim().min(1).max(200).optional(),
  sourceMessageId: z.string().trim().min(1).max(200).optional(),
  mode: z.enum(['chat', 'teacher_review']).optional().default('chat'),
  teacherInput: z.string().trim().max(2000).optional(),
  pronouns: z
    .object({
      senderCall: z.string().min(1),
      recipientCall: z.string().min(1),
      label: z.string().optional()
    })
    .optional(),
  provider: z.string().trim().max(40).optional(),
  baseUrl: z.string().trim().max(2048).optional(),
  apiKey: z.string().trim().max(4096).optional(),
  model: z.string().trim().max(200).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        conversationId: z.string().optional(),
        sender: z.enum(['student', 'staff', 'system']),
        senderName: z.string().optional(),
        text: z.string().default(''),
        attachments: z.array(z.unknown()).optional().default([]),
        createdAt: z.string().optional().default(() => new Date().toISOString())
      })
    )
    .max(100)
    .optional()
    .default([])
});

suggestionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = suggestionRequestSchema.parse(req.body);
    if (input.mode === 'teacher_review' && !input.teacherInput?.trim()) {
      throw new HttpError(400, 'teacherInput là bắt buộc khi ở chế độ chấm bài (teacher_review)');
    }

    const headerKey = req.headers['x-gemini-api-key'] as string | undefined;
    const headerModel = req.headers['x-gemini-model'] as string | undefined;

    const request = {
      ...input,
      apiKey: input.apiKey || headerKey,
      model: input.model || headerModel
    };
    try { resolveAI(request); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Cấu hình AI không hợp lệ'); }
    const pageId = req.staffAuth?.pageId;
    if (!pageId) throw new HttpError(403, 'Không xác định được page của phiên đăng nhập.', 'PAGE_ACCESS_DENIED');
    const identity = getConversationIdentity(pageId, input.conversationId);
    let contextStudent=identity.student;
    let reviewSourceMessageId:string|undefined;
    if(input.mode==='teacher_review') {
      const targetStudentId=input.studentId||identity.student?.id;
      if(!targetStudentId) {
        // A teacher may get a non-persistent wording suggestion from their
        // current note, but no student messages/facts/session are selected
        // until identity is resolved.
        if(input.reviewSessionId||input.sourceMessageId)
          throw new HttpError(409,'Chọn hồ sơ học viên trước khi dùng nguồn hoặc lượt chấm bài.','STUDENT_SELECTION_REQUIRED');
        contextStudent=null;
      } else {
        const selected=getStudent(pageId,targetStudentId);
        const latest=input.sourceMessageId?{id:input.sourceMessageId}:getLatestStudentMessageForStudent(pageId,input.conversationId,targetStudentId);
        if(!latest) throw new HttpError(409,'Không tìm thấy tin nộp bài đã đồng bộ thuộc học viên này.','SUBMISSION_SOURCE_REQUIRED');
        if(getEffectiveMessageStudent(pageId,input.conversationId,latest.id)!==targetStudentId)
          throw new HttpError(409,'Tin nộp bài thuộc học viên khác.','STUDENT_LINK_MISMATCH');
        const source=getCachedMessage(pageId,input.conversationId,latest.id);
        if(source.sender!=='student') throw new HttpError(400,'Nguồn bài nộp phải là tin nhắn của học viên.','SUBMISSION_SOURCE_INVALID');
        reviewSourceMessageId=latest.id;
        contextStudent={id:targetStudentId,name:selected.name,revision:selected.revision};
        if(input.reviewSessionKey===undefined&&!input.reviewSessionId)
          throw new HttpError(400,'Cần idempotency key cho lượt chấm bài.','REVIEW_IDEMPOTENCY_KEY_REQUIRED');
      }
    }
    if(contextStudent) {
      if(input.studentId&&input.mode!=='teacher_review'&&input.studentId!==contextStudent.id)
        throw new HttpError(409,'Hội thoại hiện đang gắn với học viên khác. Hãy tải lại hồ sơ trước khi tạo gợi ý.','STUDENT_IDENTITY_CHANGED');
      if(input.contextRevision!==undefined&&input.contextRevision!==contextStudent.revision)
        throw new HttpError(409,`Hồ sơ học viên đã đổi từ revision ${input.contextRevision} sang ${contextStudent.revision}. Hãy tải lại hồ sơ rồi thử lại.`,'STUDENT_CONTEXT_STALE');
    }
    const scopedClientMessages=filterMessagesForStudent(pageId,input.conversationId,contextStudent?.id,input.messages);
    const messages = input.mode === 'chat'
      ? await resolveReplyContext({
          conversationId: input.conversationId,
          pageId,
          studentId:contextStudent?.id,
          messages: scopedClientMessages
        })
      : scopedClientMessages;
    if (input.mode === 'chat' && !messages.some((message) => message.sender === 'student')) {
      throw new HttpError(409, 'Không có cụm tin nhắn mới nào của học viên đang chờ trả lời.', 'NO_PENDING_STUDENT_MESSAGES');
    }

    let studentContext: Parameters<typeof createSuggestions>[0]['studentContext'];
    let reviewSessionId = input.reviewSessionId;
    if (contextStudent) {
      if (reviewSessionId) {
        const session = getDatabase().prepare(`SELECT id,teacher_input AS teacherInput,assignment_id AS assignmentId FROM student_review_sessions WHERE id=? AND student_id=? AND conversation_id=?`)
          .get(reviewSessionId,contextStudent.id,input.conversationId);
        if (!session) throw new HttpError(409,'Lượt trả bài không thuộc học viên/hội thoại hiện tại.','REVIEW_SESSION_MISMATCH');
        const sessionRow=session as {teacherInput:string;assignmentId:string|null};
        if(sessionRow.teacherInput!==input.teacherInput?.trim() || sessionRow.assignmentId!==(input.assignmentId||null))
          throw new HttpError(409,'Lượt trả bài đã được tạo cho nhận xét hoặc bài tập khác.','REVIEW_SESSION_MISMATCH');
      } else if (input.mode === 'teacher_review') {
        if(!input.reviewSessionKey) throw new HttpError(400,'Cần idempotency key cho lượt chấm bài.','REVIEW_IDEMPOTENCY_KEY_REQUIRED');
      }
      const summary = getStudentSummary(pageId,contextStudent.id,{writeCache:false}) as {
        revision:number;facts:Array<Record<string,unknown>>;unresolvedIssues:Array<Record<string,unknown>>;
        historyCoverage:{status:string;oldestMessageAt?:string|null;lastSyncedAt?:string|null};
      };
      const selectedStudent=getStudent(pageId,contextStudent.id);
      studentContext = {
        studentId:contextStudent.id,
        studentName:selectedStudent.name,
        revision:summary.revision,
        facts:summary.facts.filter((fact)=>fact.useInSuggestions===1 || fact.useInSuggestions===true)
          .filter((fact)=>fact.sensitivity==='normal'&&fact.verificationStatus==='confirmed'&&fact.conflictStatus!=='pending')
          .filter((fact)=>fact.kind!=='event'||isRelevantEvent(String(fact.content),[...messages.map((item)=>item.text),input.teacherInput||''].join('\n')))
          .slice(0,20).map((fact)=>({
          id:String(fact.id),kind:String(fact.kind),content:String(fact.content),sourceText:typeof fact.sourceText==='string'?fact.sourceText:undefined,
          sourceMessageId:typeof fact.sourceMessageId==='string'?fact.sourceMessageId:undefined,
          occurredAt:typeof fact.occurredAt==='string'?fact.occurredAt:undefined,
          expiresAt:typeof fact.expiresAt==='string'?fact.expiresAt:undefined
        })),
      issueReferences:summary.unresolvedIssues.slice(0,12).map((issue)=>({
          id:String(issue.id),title:String(issue.title),status:String(issue.status),
          lastOccurredAt:typeof issue.lastOccurredAt==='string'?issue.lastOccurredAt:undefined,
          latestPracticeAction:typeof issue.latestPracticeAction==='string'?issue.latestPracticeAction:undefined
        })),
        historyCoverage:summary.historyCoverage
      };
    }
    const createReviewAfterProvider = contextStudent && input.mode==='teacher_review' && !reviewSessionId;
    const result = await createSuggestions({ ...request, messages, studentContext, reviewSessionId }, createReviewAfterProvider ? {
      afterProviderSuccess: () => {
        const created = createReviewSession({
          pageId, studentId:contextStudent!.id, conversationId:input.conversationId,
          assignmentId:input.assignmentId, assignmentTitle:input.assignmentTitle,
          teacherInput:input.teacherInput || '',
          sourceMessageId:reviewSourceMessageId,
          clientKey:input.reviewSessionKey!,
          staffId:req.staffAuth?.userId || 'staff'
        });
        reviewSessionId=created.id;
        return {reviewSessionId};
      }
    } : undefined);
    const usedFacts = formatStudentContext(studentContext,input.mode==='teacher_review').facts.map((fact)=>({
      id:fact.id,kind:fact.kind,content:fact.content,sourceMessageId:fact.sourceMessageId
    }));
    res.json({ ...result, identityStatus:identity.status,
      contextVersion:studentContext?`${studentContext.studentId}:${studentContext.revision}`:null,
      usedFacts, historyCoverage:studentContext?.historyCoverage || {status:'unknown'},
      reviewSessionId:reviewSessionId || null,
      requestId: String(res.locals.requestId || '') });
  })
);

function isRelevantEvent(content:string,context:string) {
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('vi');
  const words=(value:string)=>new Set(normalize(value).split(/[^a-z0-9]+/).filter((word)=>word.length>=4));
  const eventWords=words(content);
  const contextWords=words(context);
  const ignored=new Set(['homnay','ngaymai','ngaykia','thangnay','tuannay','conbe','hocvien','lopnhac','sinhnhat','giađinh']);
  let overlap=0;
  for(const word of eventWords) if(!ignored.has(word)&&contextWords.has(word)) overlap++;
  return overlap>0;
}
