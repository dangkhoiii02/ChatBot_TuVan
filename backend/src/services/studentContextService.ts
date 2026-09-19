import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';

export type SourceOrigin = 'user_input' | 'ai_suggested' | 'confirmed' | 'empty' | 'conflict';

export type StoredProfileField = {
  key: string;
  label: string;
  value: string;
  source: SourceOrigin;
  evidence?: string;
  aiSuggestion?: string;
  conflictReason?: string;
};

export type StoredProfile = {
  recipientCall: string;
  senderCall: string;
  nextAction: string;
  specialNotes: string;
  studyNotes: string;
  dataStatus: 'saved' | 'ai_suggested' | 'unclear' | 'conflict';
  fields: StoredProfileField[];
};

export type StoredMemory = {
  id: string;
  content: string;
  status: 'active' | 'ai_suggested' | 'review_due' | 'expired' | 'archived';
  reason?: string;
  reviewAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredCustomField = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select';
  fillMode: 'manual' | 'ai_extract' | 'ai_evaluate';
  useInSuggestions: boolean;
  value: string;
  options?: string[];
  source: SourceOrigin;
  evidence?: string;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StudentContext = {
  pageId: string;
  studentId: string;
  studentName: string;
  profile: StoredProfile & { customFields: StoredCustomField[] };
  memories: StoredMemory[];
  revision: number;
  updatedAt: string | null;
};

type StoredRow = {
  page_id: string;
  student_id: string;
  student_name: string;
  profile_json: string;
  memories_json: string;
  custom_fields_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

type MutableContext = {
  studentName: string;
  profile: StoredProfile;
  memories: StoredMemory[];
  customFields: StoredCustomField[];
};

export function getStudentContext(pageId: string, studentId: string, studentName: string): StudentContext {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM student_contexts WHERE page_id = ? AND student_id = ?')
    .get(pageId, studentId) as StoredRow | undefined;

  if (!row) {
    return {
      pageId,
      studentId,
      studentName,
      profile: { ...createDefaultProfile(studentName), customFields: [] },
      memories: [],
      revision: 0,
      updatedAt: null
    };
  }

  return rowToContext(row);
}

export function updateStudentContext(
  pageId: string,
  studentId: string,
  studentName: string,
  expectedRevision: number,
  updater: (current: MutableContext) => MutableContext
): StudentContext {
  const db = getDatabase();
  const current = getStudentContext(pageId, studentId, studentName);
  if (current.revision !== expectedRevision) {
    throw new HttpError(
      409,
      `Dữ liệu đã thay đổi ở nơi khác (server revision ${current.revision}).`,
      'REVISION_CONFLICT'
    );
  }

  const next = updater({
    studentName: studentName || current.studentName,
    profile: stripCustomFields(current.profile),
    memories: current.memories,
    customFields: current.profile.customFields
  });
  const now = new Date().toISOString();
  const nextRevision = current.revision + 1;

  if (current.revision === 0 && current.updatedAt === null) {
    try {
      db.prepare(`
        INSERT INTO student_contexts (
          page_id, student_id, student_name, profile_json, memories_json,
          custom_fields_json, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        pageId,
        studentId,
        next.studentName,
        JSON.stringify(next.profile),
        JSON.stringify(next.memories),
        JSON.stringify(next.customFields),
        nextRevision,
        now,
        now
      );
    } catch (error) {
      // A concurrent request may have created the row after our initial read.
      const latest = getStudentContext(pageId, studentId, studentName);
      if (latest.revision !== expectedRevision) {
        throw new HttpError(409, 'Dữ liệu vừa được tạo ở nơi khác. Hãy tải lại.', 'REVISION_CONFLICT');
      }
      throw error;
    }
  } else {
    const result = db.prepare(`
      UPDATE student_contexts
      SET student_name = ?, profile_json = ?, memories_json = ?, custom_fields_json = ?,
          revision = ?, updated_at = ?
      WHERE page_id = ? AND student_id = ? AND revision = ?
    `).run(
      next.studentName,
      JSON.stringify(next.profile),
      JSON.stringify(next.memories),
      JSON.stringify(next.customFields),
      nextRevision,
      now,
      pageId,
      studentId,
      expectedRevision
    );
    if (Number(result.changes) !== 1) {
      throw new HttpError(409, 'Dữ liệu đã thay đổi ở nơi khác. Hãy tải lại.', 'REVISION_CONFLICT');
    }
  }

  return getStudentContext(pageId, studentId, next.studentName);
}

export function createMemory(input: {
  content: string;
  reason?: string;
  reviewAt?: string;
  status?: StoredMemory['status'];
}): StoredMemory {
  const now = new Date().toISOString();
  return {
    id: `mem-${randomUUID()}`,
    content: input.content,
    status: input.status || 'active',
    reason: input.reason,
    reviewAt: input.reviewAt,
    createdAt: now,
    updatedAt: now
  };
}

export function createCustomField(input: Omit<StoredCustomField, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  return {
    ...input,
    id: `field-${randomUUID()}`,
    createdAt: now,
    updatedAt: now
  } satisfies StoredCustomField;
}

function rowToContext(row: StoredRow): StudentContext {
  const profile = parseObject<StoredProfile>(row.profile_json, createDefaultProfile(row.student_name));
  const memories = parseArray<StoredMemory>(row.memories_json);
  const customFields = parseArray<StoredCustomField>(row.custom_fields_json);
  return {
    pageId: row.page_id,
    studentId: row.student_id,
    studentName: row.student_name,
    profile: { ...profile, customFields },
    memories,
    revision: row.revision,
    updatedAt: row.updated_at
  };
}

function createDefaultProfile(studentName: string): StoredProfile {
  return {
    recipientCall: 'Em',
    senderCall: 'Thầy',
    nextAction: 'Chưa xác định',
    specialNotes: '',
    studyNotes: '',
    dataStatus: 'unclear',
    fields: [
      {
        key: 'recipient',
        label: 'Người nhận',
        value: studentName,
        source: studentName ? 'user_input' : 'empty'
      },
      { key: 'sender', label: 'Người gửi xưng', value: 'Thầy', source: 'user_input' },
      { key: 'special', label: 'Lưu ý đặc biệt', value: '', source: 'empty' },
      { key: 'study', label: 'Ghi chú học tập', value: '', source: 'empty' },
      { key: 'next', label: 'Việc cần làm tiếp', value: 'Chưa xác định', source: 'empty' }
    ]
  };
}

function stripCustomFields(profile: StudentContext['profile']): StoredProfile {
  const { customFields: _customFields, ...stored } = profile;
  return stored;
}

function parseArray<T>(raw: string): T[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function parseObject<T>(raw: string, fallback: T): T {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}
