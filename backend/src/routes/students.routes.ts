import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  createCustomField,
  createMemory,
  getStudentContext,
  updateStudentContext,
  type StoredMemory
} from '../services/studentContextService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const studentsRouter = Router();

const idSchema = z.string().trim().min(1).max(200);
const pageSchema = z.string().trim().min(1).max(200);
const sourceSchema = z.enum(['user_input', 'ai_suggested', 'confirmed', 'empty', 'conflict']);

const profileFieldSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  value: z.string().max(5000),
  source: sourceSchema,
  evidence: z.string().max(5000).optional(),
  aiSuggestion: z.string().max(5000).optional(),
  conflictReason: z.string().max(1000).optional()
});

const profileSchema = z.object({
  recipientCall: z.string().trim().min(1).max(50),
  senderCall: z.string().trim().min(1).max(50),
  nextAction: z.string().max(2000),
  specialNotes: z.string().max(5000),
  studyNotes: z.string().max(10000),
  dataStatus: z.enum(['saved', 'ai_suggested', 'unclear', 'conflict']),
  fields: z.array(profileFieldSchema).max(100)
});

const contextIdentitySchema = z.object({
  pageId: pageSchema,
  studentName: z.string().trim().max(200).optional().default('Học viên')
});

const mutationBaseSchema = contextIdentitySchema.extend({
  revision: z.number().int().nonnegative()
});

const memoryStatusSchema = z.enum(['active', 'ai_suggested', 'review_due', 'expired', 'archived']);

const customFieldInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(['text', 'number', 'select']),
    fillMode: z.enum(['manual', 'ai_extract', 'ai_evaluate']),
    useInSuggestions: z.boolean(),
    value: z.string().max(5000),
    options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    source: sourceSchema.default('user_input'),
    evidence: z.string().max(5000).optional(),
    hidden: z.boolean().optional().default(false)
  })
  .superRefine((field, ctx) => {
    if (field.type === 'number' && field.value.trim() && !Number.isFinite(Number(field.value))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Giá trị phải là số.' });
    }
    if (field.type === 'select' && !(field.options || []).length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Field lựa chọn cần ít nhất một option.' });
    }
    if (field.fillMode === 'ai_evaluate' && !field.evidence?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidence'],
        message: 'Field AI đánh giá cần mô tả tiêu chí trong phần căn cứ.'
      });
    }
  });

studentsRouter.get(
  '/:studentId/context',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const query = contextIdentitySchema.parse(req.query);
    assertPageAccess(req, query.pageId);
    res.json(getStudentContext(query.pageId, studentId, query.studentName));
  })
);

studentsRouter.patch(
  '/:studentId/profile',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const body = mutationBaseSchema.extend({ profile: profileSchema }).parse(req.body);
    assertPageAccess(req, body.pageId);
    const context = updateStudentContext(
      body.pageId,
      studentId,
      body.studentName,
      body.revision,
      (current) => ({ ...current, profile: body.profile })
    );
    res.json(context);
  })
);

studentsRouter.post(
  '/:studentId/memories',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const body = mutationBaseSchema
      .extend({
        content: z.string().trim().min(1).max(5000),
        reason: z.string().trim().max(2000).optional(),
        reviewAt: z.string().datetime().optional(),
        status: memoryStatusSchema.optional()
      })
      .parse(req.body);
    assertPageAccess(req, body.pageId);
    const memory = createMemory(body);
    const context = updateStudentContext(
      body.pageId,
      studentId,
      body.studentName,
      body.revision,
      (current) => ({ ...current, memories: [memory, ...current.memories] })
    );
    res.status(201).json(context);
  })
);

studentsRouter.patch(
  '/:studentId/memories/:memoryId',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const memoryId = idSchema.parse(req.params.memoryId);
    const body = mutationBaseSchema
      .extend({
        action: z.enum(['update', 'activate', 'archive', 'restore']),
        content: z.string().trim().min(1).max(5000).optional(),
        reason: z.string().trim().max(2000).optional(),
        reviewAt: z.string().datetime().nullable().optional()
      })
      .parse(req.body);
    assertPageAccess(req, body.pageId);
    const context = updateStudentContext(
      body.pageId,
      studentId,
      body.studentName,
      body.revision,
      (current) => {
        let found = false;
        const memories = current.memories.map((memory) => {
          if (memory.id !== memoryId) return memory;
          found = true;
          return updateMemory(memory, body);
        });
        if (!found) throw new HttpError(404, 'Không tìm thấy ghi nhớ.', 'MEMORY_NOT_FOUND');
        return { ...current, memories };
      }
    );
    res.json(context);
  })
);

studentsRouter.delete(
  '/:studentId/memories/:memoryId',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const memoryId = idSchema.parse(req.params.memoryId);
    const body = mutationBaseSchema.parse(req.body);
    assertPageAccess(req, body.pageId);
    const context = updateStudentContext(
      body.pageId,
      studentId,
      body.studentName,
      body.revision,
      (current) => {
        const memories = current.memories.filter((memory) => memory.id !== memoryId);
        if (memories.length === current.memories.length) {
          throw new HttpError(404, 'Không tìm thấy ghi nhớ.', 'MEMORY_NOT_FOUND');
        }
        return { ...current, memories };
      }
    );
    res.json(context);
  })
);

studentsRouter.post(
  '/:studentId/custom-fields',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const body = mutationBaseSchema.extend({ field: customFieldInputSchema }).parse(req.body);
    assertPageAccess(req, body.pageId);
    const field = createCustomField(body.field);
    const context = updateStudentContext(
      body.pageId,
      studentId,
      body.studentName,
      body.revision,
      (current) => {
        if (current.customFields.some((item) => item.name.toLocaleLowerCase('vi') === field.name.toLocaleLowerCase('vi'))) {
          throw new HttpError(409, 'Tên field đã tồn tại.', 'CUSTOM_FIELD_DUPLICATE');
        }
        return { ...current, customFields: [...current.customFields, field] };
      }
    );
    res.status(201).json(context);
  })
);

studentsRouter.patch(
  '/:studentId/custom-fields/:fieldId',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const fieldId = idSchema.parse(req.params.fieldId);
    const body = mutationBaseSchema
      .extend({
        value: z.string().max(5000).optional(),
        useInSuggestions: z.boolean().optional(),
        hidden: z.boolean().optional()
      })
      .parse(req.body);
    assertPageAccess(req, body.pageId);
    const context = updateStudentContext(
      body.pageId,
      studentId,
      body.studentName,
      body.revision,
      (current) => {
        let found = false;
        const customFields = current.customFields.map((field) => {
          if (field.id !== fieldId) return field;
          found = true;
          const value = body.value ?? field.value;
          if (field.type === 'number' && value.trim() && !Number.isFinite(Number(value))) {
            throw new HttpError(400, 'Giá trị phải là số.', 'CUSTOM_FIELD_INVALID_VALUE');
          }
          if (field.type === 'select' && value && !(field.options || []).includes(value)) {
            throw new HttpError(400, 'Giá trị không thuộc danh sách lựa chọn.', 'CUSTOM_FIELD_INVALID_VALUE');
          }
          return {
            ...field,
            value,
            useInSuggestions: body.useInSuggestions ?? field.useInSuggestions,
            hidden: body.hidden ?? field.hidden,
            source: 'user_input' as const,
            updatedAt: new Date().toISOString()
          };
        });
        if (!found) throw new HttpError(404, 'Không tìm thấy custom field.', 'CUSTOM_FIELD_NOT_FOUND');
        return { ...current, customFields };
      }
    );
    res.json(context);
  })
);

studentsRouter.delete(
  '/:studentId/custom-fields/:fieldId',
  asyncHandler(async (req, res) => {
    const studentId = idSchema.parse(req.params.studentId);
    const fieldId = idSchema.parse(req.params.fieldId);
    const body = mutationBaseSchema.parse(req.body);
    assertPageAccess(req, body.pageId);
    const context = updateStudentContext(
      body.pageId,
      studentId,
      body.studentName,
      body.revision,
      (current) => {
        const customFields = current.customFields.filter((field) => field.id !== fieldId);
        if (customFields.length === current.customFields.length) {
          throw new HttpError(404, 'Không tìm thấy custom field.', 'CUSTOM_FIELD_NOT_FOUND');
        }
        return { ...current, customFields };
      }
    );
    res.json(context);
  })
);

function assertPageAccess(req: Request, pageId: string) {
  const allowedPageId = req.staffAuth?.pageId;
  if (allowedPageId && pageId !== allowedPageId) {
    throw new HttpError(403, 'Bạn không có quyền truy cập page này.', 'PAGE_FORBIDDEN');
  }
}

function updateMemory(
  memory: StoredMemory,
  body: {
    action: 'update' | 'activate' | 'archive' | 'restore';
    content?: string;
    reason?: string;
    reviewAt?: string | null;
  }
): StoredMemory {
  let status: StoredMemory['status'] = memory.status;
  if (body.action === 'activate' || body.action === 'restore') status = 'active';
  if (body.action === 'archive') status = 'archived';
  return {
    ...memory,
    status,
    content: body.content ?? memory.content,
    reason: body.reason ?? memory.reason,
    reviewAt: body.reviewAt === null ? undefined : body.reviewAt ?? memory.reviewAt,
    updatedAt: new Date().toISOString()
  };
}
