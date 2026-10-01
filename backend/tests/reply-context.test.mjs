import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessage } from '../dist/services/pancakeNormalizer.js';
import { selectLatestUnansweredTurn } from '../dist/services/replyContextService.js';

test('Pancake INBOX messages from the page are staff messages', () => {
  const staff = normalizeMessage({ id: 'out', type: 'INBOX', page_id: 'page-1', from: { id: 'page-1', admin_name: 'Staff' }, message: 'Sent reply' }, 'conversation-1');
  const student = normalizeMessage({ id: 'in', type: 'INBOX', page_id: 'page-1', from: { id: 'customer-1' }, message: 'Question' }, 'conversation-1');
  assert.equal(staff.sender, 'staff');
  assert.equal(student.sender, 'student');
});

test('suggestion context keeps student turn and subsequent staff reply', () => {
  const messages = [
    { sender: 'staff', text: 'Earlier reply', createdAt: '2026-10-01T10:00:00Z' },
    { sender: 'student', text: 'New question', createdAt: '2026-10-01T10:01:00Z' },
    { sender: 'staff', text: 'Already answered', createdAt: '2026-10-01T10:02:00Z' }
  ];
  assert.deepEqual(selectLatestUnansweredTurn(messages).map((item) => item.text),
    ['Earlier reply', 'New question', 'Already answered']);
});
