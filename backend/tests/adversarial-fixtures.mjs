export const FIXTURE = Object.freeze({
  pageId: 'page-test',
  staffId: 'staff-test',
  customerId: 'customer-test',
  studentA: 'student-a',
  studentB: 'student-b',
  studentOtherPage: 'student-other-page',
  conversationA: 'conversation-a',
  conversationShared: 'conversation-shared',
  conversationTeacher: 'conversation-teacher',
  messageAOld: 'message-a-old',
  messageANew: 'message-a-new',
  messageB: 'message-b',
  messageTeacher: 'message-teacher',
  messageStudent: 'message-student',
  factPrivateEvent: 'fact-private-event',
  factNormalEvent: 'fact-normal-event',
  factLearningNote: 'fact-learning-note',
  factPreferenceLan: 'fact-preference-lan',
  factPreferenceMai: 'fact-preference-mai',
  assignment: 'assignment-test',
  reviewSession: 'review-session-test',
  issue: 'issue-test',
  occurrence: 'occurrence-test',
  evidence: 'evidence-test',
  historyCursor: 'history-cursor-test'
});

const CREATED = '2026-09-01T00:00:00.000Z';

/** Seed fixed, fake data in the caller's isolated SQLite database. Safe to rerun. */
export function seedAdversarialFixtures(db) {
  const run = (sql, ...values) => db.prepare(sql).run(...values);

  run(`INSERT OR IGNORE INTO conversations(id,page_id,customer_id,customer_name,last_message,updated_at)
    VALUES (?,?,?,?,?,?)`, FIXTURE.conversationA, FIXTURE.pageId, FIXTURE.customerId, 'QA shared customer', '', CREATED);
  run(`INSERT OR IGNORE INTO conversations(id,page_id,customer_id,customer_name,last_message,updated_at)
    VALUES (?,?,?,?,?,?)`, FIXTURE.conversationShared, FIXTURE.pageId, FIXTURE.customerId, 'QA shared customer', '', CREATED);
  run(`INSERT OR IGNORE INTO conversations(id,page_id,customer_id,customer_name,last_message,updated_at)
    VALUES (?,?,?,?,?,?)`, FIXTURE.conversationTeacher, FIXTURE.pageId, FIXTURE.customerId, 'QA shared customer', '', CREATED);

  for (const [id, name, pageId] of [
    [FIXTURE.studentA, 'Student A', FIXTURE.pageId],
    [FIXTURE.studentB, 'Student B', FIXTURE.pageId],
    [FIXTURE.studentOtherPage, 'Other page student', 'other-page-test']
  ]) {
    run(`INSERT OR IGNORE INTO students(id,page_id,name,created_at,updated_at) VALUES (?,?,?,?,?)`, id, pageId, name, CREATED, CREATED);
  }

  for (const [conversationId, studentId] of [
    [FIXTURE.conversationA, FIXTURE.studentA],
    [FIXTURE.conversationShared, FIXTURE.studentB],
    [FIXTURE.conversationTeacher, FIXTURE.studentB]
  ]) {
    run(`INSERT OR IGNORE INTO student_conversation_links(page_id,conversation_id,student_id,linked_by,linked_at)
      VALUES (?,?,?,?,?)`, FIXTURE.pageId, conversationId, studentId, FIXTURE.staffId, CREATED);
  }
  run(`INSERT OR IGNORE INTO student_conversation_link_history
    (id,page_id,customer_id,conversation_id,student_id,valid_from,valid_to,source,confirmed_by)
    VALUES (?,?,?,?,?,?,?,?,?)`, 'history-a-shared', FIXTURE.pageId, FIXTURE.customerId, FIXTURE.conversationShared,
    FIXTURE.studentA, '2026-01-01T00:00:00.000Z', '2026-09-15T00:00:00.000Z', 'staff_confirmed', FIXTURE.staffId);
  run(`INSERT OR IGNORE INTO student_conversation_link_history
    (id,page_id,customer_id,conversation_id,student_id,valid_from,valid_to,source,confirmed_by)
    VALUES (?,?,?,?,?,?,?,?,?)`, 'history-b-shared', FIXTURE.pageId, FIXTURE.customerId, FIXTURE.conversationShared,
    FIXTURE.studentB, '2026-09-15T00:00:00.000Z', null, 'staff_confirmed', FIXTURE.staffId);
  for (const conversationId of [FIXTURE.conversationA, FIXTURE.conversationTeacher]) {
    const studentId = conversationId === FIXTURE.conversationA ? FIXTURE.studentA : FIXTURE.studentB;
    run(`INSERT OR IGNORE INTO student_conversation_link_history
      (id,page_id,customer_id,conversation_id,student_id,valid_from,valid_to,source,confirmed_by)
      VALUES (?,?,?,?,?,?,NULL,'staff_confirmed',?)`, `history-${conversationId}`, FIXTURE.pageId, FIXTURE.customerId,
      conversationId, studentId, '2026-01-01T00:00:00.000Z', FIXTURE.staffId);
  }

  const messages = [
    [FIXTURE.conversationShared, FIXTURE.messageAOld, 'student', 'Student A', 'A sent the first scale recording.', '2026-09-01T10:00:00.000Z', FIXTURE.studentA],
    [FIXTURE.conversationShared, FIXTURE.messageANew, 'student', 'Student A', 'A sent a newer scale recording.', '2026-09-10T10:00:00.000Z', FIXTURE.studentA],
    [FIXTURE.conversationShared, FIXTURE.messageB, 'student', 'Student B', 'I practiced scales before the piano recital Saturday.', '2026-09-20T10:00:00.000Z', FIXTURE.studentB],
    [FIXTURE.conversationShared, FIXTURE.messageStudent, 'student', 'Student B', 'I practiced scales before the piano recital Saturday.', '2026-09-20T11:00:00.000Z', FIXTURE.studentB],
    [FIXTURE.conversationTeacher, FIXTURE.messageTeacher, 'staff', 'Teacher', 'Keep your wrist relaxed.', '2026-09-20T12:00:00.000Z', FIXTURE.studentB]
  ];
  for (const [conversationId, id, sender, senderName, text, createdAt] of messages) {
    run(`INSERT OR IGNORE INTO messages(id,conversation_id,sender,sender_name,text,attachments_json,created_at)
      VALUES (?,?,?,?,?,'[]',?)`, id, conversationId, sender, senderName, text, createdAt);
    run(`INSERT OR IGNORE INTO conversation_message_cache
      (page_id,conversation_id,message_id,sender,sender_name,text,attachments_json,created_at)
      VALUES (?,?,?,?,?,?,'[]',?)`, FIXTURE.pageId, conversationId, id, sender, senderName, text, createdAt);
  }

  for (const [id, studentId, kind, content, conflictKey, conflictStatus, sensitivity, useInSuggestions] of [
    [FIXTURE.factPrivateEvent, FIXTURE.studentB, 'event', 'Confidential family court hearing', null, 'none', 'private', 0],
    [FIXTURE.factNormalEvent, FIXTURE.studentB, 'event', 'Piano recital on Saturday', null, 'none', 'normal', 1],
    [FIXTURE.factLearningNote, FIXTURE.studentB, 'learning_note', 'Confirmed: practices scales slowly with a metronome.', null, 'none', 'normal', 1],
    [FIXTURE.factPreferenceLan, FIXTURE.studentA, 'preference', 'Call me Lan', 'preferred_name', 'pending', 'normal', 1],
    [FIXTURE.factPreferenceMai, FIXTURE.studentA, 'preference', 'Call me Mai', 'preferred_name', 'pending', 'normal', 1]
  ]) {
    run(`INSERT OR IGNORE INTO student_facts
      (id,student_id,kind,content,conflict_key,conflict_status,verification_status,sensitivity,status,use_in_suggestions,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'confirmed',?,'active',?,?,?,?)`, id, studentId, kind, content, conflictKey, conflictStatus,
      sensitivity, useInSuggestions, 'fixture-seed', CREATED, CREATED);
  }

  run(`INSERT OR IGNORE INTO student_assignments
    (id,student_id,title,normalized_title,started_at,started_source,status,revision,created_at,updated_at)
    VALUES (?,?,?,?,?,?, 'active',0,?,?)`, FIXTURE.assignment, FIXTURE.studentB, 'Major scales', 'major scales',
    '2026-09-20T09:00:00.000Z', 'Teacher note: message-teacher', CREATED, CREATED);
  run(`INSERT OR IGNORE INTO student_review_sessions
    (id,student_id,assignment_id,conversation_id,submitted_at,reviewed_at,teacher_input,status,confirmed_at,
     confirmation_evidence,source_message_id,client_key,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'confirmed',?,?,?,?,'fixture-seed',?,?)`, FIXTURE.reviewSession, FIXTURE.studentB, FIXTURE.assignment,
    FIXTURE.conversationShared, '2026-09-20T10:00:00.000Z', '2026-09-20T13:00:00.000Z', 'Use a relaxed wrist.',
    '2026-09-20T13:01:00.000Z', 'Fixture review sent.', FIXTURE.messageB, 'fixture-review-session', CREATED, CREATED);
  run(`INSERT OR IGNORE INTO student_issues
    (id,student_id,title,normalized_title,summary,status,first_occurred_at,last_occurred_at,revision,created_at,updated_at)
    VALUES (?,?,?,?,?,'active',?,?,1,?,?)`, FIXTURE.issue, FIXTURE.studentB, 'Relax wrist', 'relax wrist',
    'Wrist tension during scales.', '2026-09-20T12:00:00.000Z', '2026-09-20T12:00:00.000Z', CREATED, CREATED);
  run(`INSERT OR IGNORE INTO issue_occurrences
    (id,issue_id,assignment_id,review_session_id,occurred_at,source_kind,approved,source_key,created_by,created_at)
    VALUES (?,?,?,?,?,'teacher_confirmed',1,?,'fixture-seed',?)`, FIXTURE.occurrence, FIXTURE.issue, FIXTURE.assignment,
    FIXTURE.reviewSession, '2026-09-20T12:00:00.000Z', 'fixture-occurrence-key', CREATED);
  run(`INSERT OR IGNORE INTO issue_evidence
    (id,occurrence_id,issue_id,conversation_id,message_id,review_session_id,speaker,verbatim_text,occurred_at,created_at)
    VALUES (?,?,?,?,?,?,? ,?,?,?)`, FIXTURE.evidence, FIXTURE.occurrence, FIXTURE.issue, FIXTURE.conversationTeacher,
    FIXTURE.messageTeacher, FIXTURE.reviewSession, 'Teacher', 'Keep your wrist relaxed.', '2026-09-20T12:00:00.000Z', CREATED);

  run(`INSERT OR IGNORE INTO conversation_sync_state
    (page_id,conversation_id,oldest_cursor,newest_message_at,oldest_message_at,last_synced_at,complete,error)
    VALUES (?,?,?,?,?,?,0,NULL)`, FIXTURE.pageId, FIXTURE.conversationShared, FIXTURE.historyCursor,
    '2026-09-20T11:00:00.000Z', '2026-09-01T10:00:00.000Z', CREATED);
  run(`INSERT OR IGNORE INTO conversation_backfill_jobs
    (page_id,conversation_id,status,priority,attempts,next_run_at,last_error,created_at,updated_at)
    VALUES (?,?,'queued',0,0,'2099-01-01T00:00:00.000Z',NULL,?,?)`, FIXTURE.pageId, FIXTURE.conversationShared, CREATED, CREATED);

  return FIXTURE;
}
