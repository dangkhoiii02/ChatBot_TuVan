import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { getStudent, listStudents } from '../services/studentIdentityService.js';
import {
  addIssueOccurrence, createAssignment, createFact, createReviewSession, getIssueDetail, getStudentSummary,
  confirmReviewSession, createSubmission, listAssignments, listFacts, listIssues, listReviewSessions, listSubmissions,
  updateAssignment, updateFact, updateIssue, updateOccurrence, updateSubmission
} from '../services/studentLearningService.js';
import { createProposal, decideProposal, extractProposals, listProposals } from '../services/studentProposalService.js';

export const studentLearningRouter=Router();
const id=z.string().trim().min(1).max(200);
const datetime=z.string().datetime();
const page=(req:Express.Request)=>req.staffAuth?.pageId||'';
const staff=(req:Express.Request)=>req.staffAuth?.userId||'staff';

studentLearningRouter.get('/',asyncHandler(async(req,res)=>res.json({items:listStudents(page(req))})));
studentLearningRouter.get('/:studentId/summary',asyncHandler(async(req,res)=>res.json(getStudentSummary(page(req),id.parse(req.params.studentId)))));

studentLearningRouter.get('/:studentId/facts',asyncHandler(async(req,res)=>{
  const includeArchived=req.query.includeArchived==='true';
  res.json({items:listFacts(page(req),id.parse(req.params.studentId),includeArchived)});
}));
studentLearningRouter.post('/:studentId/facts',asyncHandler(async(req,res)=>{
  const body=z.object({kind:z.enum(['preference','event','learning_note']),content:z.string().trim().min(1).max(5000),
    sourceText:z.string().max(5000).optional(),sourceMessageId:id.optional(),sourceConversationId:id.optional(),
    occurredAt:datetime.optional(),expiresAt:datetime.optional(),useInSuggestions:z.boolean().default(true),
    sensitivity:z.enum(['normal','private']).optional(),conflictKey:id.optional()}).parse(req.body);
  res.status(201).json({items:createFact({...body,pageId:page(req),studentId:id.parse(req.params.studentId),staffId:staff(req)})});
}));
studentLearningRouter.patch('/:studentId/facts/:factId',asyncHandler(async(req,res)=>{
  const body=z.object({kind:z.enum(['preference','event','learning_note']).optional(),content:z.string().trim().min(1).max(5000).optional(),status:z.enum(['active','archived']).optional(),
    expiresAt:datetime.nullable().optional(),useInSuggestions:z.boolean().optional(),
    sensitivity:z.enum(['normal','private']).optional(),verificationStatus:z.enum(['confirmed','legacy_unverified']).optional(),
    conflictResolution:z.enum(['keep_current','use_this']).optional()}).parse(req.body);
  res.json({items:updateFact({...body,pageId:page(req),studentId:id.parse(req.params.studentId),factId:id.parse(req.params.factId),staffId:staff(req)})});
}));

studentLearningRouter.get('/:studentId/assignments',asyncHandler(async(req,res)=>res.json({items:listAssignments(page(req),id.parse(req.params.studentId))})));
studentLearningRouter.post('/:studentId/assignments',asyncHandler(async(req,res)=>{
  const body=z.object({title:z.string().trim().min(1).max(200),startedAt:datetime.optional(),startedSource:z.string().max(1000).optional()}).parse(req.body);
  res.status(201).json(createAssignment({...body,pageId:page(req),studentId:id.parse(req.params.studentId)}));
}));
studentLearningRouter.patch('/:studentId/assignments/:assignmentId',asyncHandler(async(req,res)=>{
  const body=z.object({title:z.string().trim().min(1).max(200).optional(),startedAt:datetime.nullable().optional(),
    startedSource:z.string().trim().max(1000).nullable().optional(),status:z.enum(['active','completed','unknown']).optional(),completionEvidence:z.string().trim().max(2000).optional(),
    revision:z.number().int().nonnegative().optional()}).parse(req.body);
  res.json(updateAssignment({...body,pageId:page(req),studentId:id.parse(req.params.studentId),assignmentId:id.parse(req.params.assignmentId)}));
}));

studentLearningRouter.get('/:studentId/review-sessions',asyncHandler(async(req,res)=>{
  const studentId=id.parse(req.params.studentId); const assignmentId=req.query.assignmentId?id.parse(req.query.assignmentId):undefined;
  res.json({items:listReviewSessions(page(req),studentId,assignmentId)});
}));
studentLearningRouter.post('/:studentId/review-sessions',asyncHandler(async(req,res)=>{
  const body=z.object({conversationId:id,assignmentId:id.optional(),assignmentTitle:z.string().trim().min(1).max(200).optional(),
    teacherInput:z.string().trim().min(1).max(5000),submittedAt:datetime.optional(),sourceMessageId:id.optional(),clientKey:id.min(1)}).parse(req.body);
  const studentId=id.parse(req.params.studentId);
  res.status(201).json(createReviewSession({...body,pageId:page(req),studentId,staffId:staff(req)}));
}));
studentLearningRouter.patch('/:studentId/review-sessions/:reviewSessionId/confirmation',asyncHandler(async(req,res)=>{
  const body=z.object({confirmed:z.boolean(),evidence:z.string().trim().max(2000).optional()}).parse(req.body);
  res.json({items:confirmReviewSession({...body,pageId:page(req),studentId:id.parse(req.params.studentId),
    reviewSessionId:id.parse(req.params.reviewSessionId),staffId:staff(req)} )});
}));
studentLearningRouter.get('/:studentId/submissions',asyncHandler(async(req,res)=>{
  const status=req.query.status===undefined?undefined:z.enum(['pending','reviewed','ignored']).parse(req.query.status);
  res.json({items:listSubmissions(page(req),id.parse(req.params.studentId),status)});
}));
studentLearningRouter.post('/:studentId/submissions',asyncHandler(async(req,res)=>{
  const body=z.object({conversationId:id,messageId:id,assignmentId:id.optional(),assignmentTitle:z.string().trim().min(1).max(200).optional(),submittedAt:datetime.optional()}).parse(req.body);
  res.status(201).json({items:createSubmission({...body,pageId:page(req),studentId:id.parse(req.params.studentId),staffId:staff(req)})});
}));
studentLearningRouter.patch('/:studentId/submissions/:submissionId',asyncHandler(async(req,res)=>{
  const body=z.object({status:z.enum(['pending','reviewed','ignored'])}).parse(req.body);
  res.json({items:updateSubmission({...body,pageId:page(req),studentId:id.parse(req.params.studentId),submissionId:id.parse(req.params.submissionId),staffId:staff(req)})});
}));

studentLearningRouter.get('/:studentId/issues',asyncHandler(async(req,res)=>{
  const query=z.object({view:z.enum(['all','recent','unresolved']).default('all'),limit:z.coerce.number().int().min(1).max(100).default(50),
    offset:z.coerce.number().int().nonnegative().default(0)}).parse(req.query);
  res.json(listIssues(page(req),id.parse(req.params.studentId),query.view,query.limit,query.offset));
}));
studentLearningRouter.get('/:studentId/issues/:issueId',asyncHandler(async(req,res)=>{
  const query=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().nonnegative().default(0)}).parse(req.query);
  res.json(getIssueDetail(page(req),id.parse(req.params.studentId),id.parse(req.params.issueId),query.limit,query.offset));
}));
studentLearningRouter.post('/:studentId/issues/occurrences',asyncHandler(async(req,res)=>{
  const body=z.object({issueId:id.optional(),title:z.string().trim().min(1).max(200).optional(),summary:z.string().max(2000).optional(),
    assignmentId:id.optional(),reviewSessionId:id.optional(),occurredAt:datetime,sourceKind:z.enum(['teacher_confirmed','student_reported','staff_confirmed']),
    conversationId:id.optional(),messageId:id.optional(),speaker:z.string().trim().min(1).max(100),verbatimText:z.string().trim().min(1).max(5000),
    practiceAction:z.string().trim().max(2000).optional(),sourceKey:id.optional(),sourceReviewSessionId:id.optional()})
    .refine((value)=>Boolean(value.issueId||value.title),'Cần chọn lỗi hoặc nhập tên lỗi mới.').parse(req.body);
  const studentId=id.parse(req.params.studentId); getStudent(page(req),studentId);
  const {sourceReviewSessionId,...occurrence}=body;
  res.status(201).json(addIssueOccurrence({...occurrence,reviewSessionIdForEvidence:sourceReviewSessionId||occurrence.reviewSessionId,
    pageId:page(req),studentId,staffId:staff(req)}));
}));
studentLearningRouter.patch('/:studentId/issues/:issueId',asyncHandler(async(req,res)=>{
  const body=z.object({revision:z.number().int().positive(),title:z.string().trim().min(1).max(200).optional(),summary:z.string().max(2000).optional(),
    status:z.enum(['active','needs_verification','resolved','recurred']).optional(),statusEvidence:z.string().max(5000).optional()}).parse(req.body);
  res.json(updateIssue({...body,pageId:page(req),studentId:id.parse(req.params.studentId),issueId:id.parse(req.params.issueId),staffId:staff(req)}));
}));
studentLearningRouter.patch('/:studentId/issues/:issueId/occurrences/:occurrenceId',asyncHandler(async(req,res)=>{
  const body=z.object({revision:z.number().int().positive(),occurredAt:datetime.optional(),sourceKind:z.enum(['teacher_confirmed','student_reported','staff_confirmed']).optional(),
    approved:z.boolean().optional(),targetIssueId:id.optional(),targetIssueTitle:z.string().trim().min(1).max(200).optional(),
    evidenceText:z.string().max(5000).optional(),speaker:z.string().max(100).optional(),evidenceConversationId:id.optional(),evidenceMessageId:id.optional(),
    evidenceReviewSessionId:id.optional()})
    .refine((value)=>!(value.targetIssueId&&value.targetIssueTitle),
      'Dùng targetIssueId hoặc targetIssueTitle, không dùng cả hai.').parse(req.body);
  res.json(updateOccurrence({...body,pageId:page(req),studentId:id.parse(req.params.studentId),issueId:id.parse(req.params.issueId),
    occurrenceId:id.parse(req.params.occurrenceId),staffId:staff(req)}));
}));

studentLearningRouter.get('/:studentId/proposals',asyncHandler(async(req,res)=>{
  const status=z.enum(['pending','accepted','rejected']).default('pending').parse(req.query.status);
  res.json(listProposals(page(req),id.parse(req.params.studentId),status));
}));
studentLearningRouter.post('/:studentId/proposals',asyncHandler(async(req,res)=>{
  const body=z.object({kind:z.enum(['preference','event','learning_note','issue','practice_action','resolution']),
    payload:z.record(z.unknown()),sourceMessageId:id.optional(),sourceReviewId:id.optional(),sourceConversationId:id.optional(),
    sourceText:z.string().max(5000).optional(),sourceOccurredAt:datetime.optional(),confidence:z.number().min(0).max(1).optional(),promptVersion:z.string().max(100).optional()}).parse(req.body);
  res.status(201).json(createProposal({...body,pageId:page(req),studentId:id.parse(req.params.studentId),staffId:staff(req)}));
}));
studentLearningRouter.post('/:studentId/proposals/extract',asyncHandler(async(req,res)=>{
  const body=z.object({conversationId:id}).parse(req.body);
  res.json(await extractProposals({pageId:page(req),studentId:id.parse(req.params.studentId),conversationId:body.conversationId}));
}));
studentLearningRouter.post('/:studentId/proposals/:proposalId/decision',asyncHandler(async(req,res)=>{
  const body=z.object({action:z.enum(['accept','reject']),content:z.string().trim().min(1).max(5000).optional(),title:z.string().trim().min(1).max(200).optional()}).parse(req.body);
  res.json(decideProposal({...body,pageId:page(req),studentId:id.parse(req.params.studentId),proposalId:id.parse(req.params.proposalId),staffId:staff(req)}));
}));
