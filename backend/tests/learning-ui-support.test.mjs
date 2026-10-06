import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { FIXTURE, seedAdversarialFixtures } from './adversarial-fixtures.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-ui-support-'));
Object.assign(process.env, { NODE_ENV: 'test', BACKEND_DATABASE_PATH: path.join(temporary, 'test.sqlite'),
  APP_SESSION_SECRET: 'learning-ui-support-tests-only', PANCAKE_PAGE_ID: FIXTURE.pageId, ALLOW_DEMO_MODE: '0' });
const [{ getDatabase }, { createApp }, { issueAppSession }, learning, proposals] = await Promise.all([
  import('../dist/db/index.js'), import('../dist/app.js'), import('../dist/services/sessionToken.js'),
  import('../dist/services/studentLearningService.js'), import('../dist/services/studentProposalService.js')
]);

test('learning UI source, proposal and timeline support', async (t) => {
  const db = getDatabase();
  seedAdversarialFixtures(db);
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = issueAppSession({ userId: FIXTURE.staffId, pageId: FIXTURE.pageId });
  try {
    await t.test('opening a chat initializes only its own profile and preserves shared identities', async () => {
      const identities=await import('../dist/services/studentIdentityService.js');
      const add=(id,customer,name)=>db.prepare(`INSERT INTO conversations(id,page_id,customer_id,customer_name,last_message,updated_at) VALUES (?,?,?,?,'','2026-09-01')`).run(id,FIXTURE.pageId,customer,name);
      const open=async id=>{
        const response=await fetch(`${origin}/api/conversations/${id}/student-profile`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({pageId:FIXTURE.pageId})});
        assert.equal(response.status,200);return (await response.json()).identity;
      };
      add('profile-one','customer-profile-one','Same name');
      add('profile-two','customer-profile-two','Same name');
      const one=await open('profile-one');const again=await open('profile-one');const two=await open('profile-two');
      assert.equal(one.student.id,again.student.id);assert.notEqual(one.student.id,two.student.id);
      db.prepare(`INSERT INTO conversation_message_cache(page_id,conversation_id,message_id,sender,text,created_at) VALUES (?,?,'old-profile-message','student','old recording','2026-08-01')`).run(FIXTURE.pageId,'profile-one');
      assert.equal(identities.getEffectiveMessageStudent(FIXTURE.pageId,'profile-one','old-profile-message'),one.student.id);
      add('profile-other-thread','customer-profile-one','Same name');assert.equal((await open('profile-other-thread')).student.id,one.student.id);
      const current=await open(FIXTURE.conversationShared);assert.equal(current.student.id,FIXTURE.studentB);
      for(const [id,studentId] of [['family-first',FIXTURE.studentA],['family-second',FIXTURE.studentB]]) {
        add(id,'ambiguous-family','Family');identities.linkConversation({pageId:FIXTURE.pageId,conversationId:id,studentId,staffId:FIXTURE.staffId});
      }
      add('family-new-thread','ambiguous-family','Family');assert.equal((await open('family-new-thread')).status,'needs_selection');
      const denied=await fetch(`${origin}/api/conversations/profile-one/student-profile`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({pageId:'other-page'})});assert.equal(denied.status,403);
    });
    await t.test('staff can append a dropdown choice and its value atomically, with fresh AI context', async () => {
      const studentId=FIXTURE.studentB;
      const auth={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
      const send=async(method,url,body)=>{
        const response=await fetch(`${origin}${url}`,{method,headers:auth,body:JSON.stringify(body)});
        return {response,data:await response.json()};
      };
      const base={pageId:FIXTURE.pageId,studentName:'Student B'};
      const contextService=await import('../dist/services/studentContextService.js');
      const before=contextService.getStudentContext(FIXTURE.pageId,studentId,'Student B');
      const created=await send('POST',`/api/students/${studentId}/custom-fields`,{...base,revision:before.revision,
        field:{name:'Ca học',type:'select',fillMode:'manual',useInSuggestions:true,value:'',options:['Sáng','Chiều']}});
      assert.equal(created.response.status,201);const field=created.data.profile.customFields.find(item=>item.name==='Ca học');assert.ok(field);
      const oldSummary=learning.getStudentSummary(FIXTURE.pageId,studentId);
      const updated=await send('PATCH',`/api/students/${studentId}/custom-fields/${field.id}`,{...base,revision:created.data.revision,addOption:'Tối thứ 7',value:'Tối thứ 7'});
      assert.equal(updated.response.status,200);const selected=updated.data.profile.customFields.find(item=>item.id===field.id);
      assert.deepEqual(selected.options,['Sáng','Chiều','Tối thứ 7']);assert.equal(selected.value,'Tối thứ 7');
      const repeated=await send('PATCH',`/api/students/${studentId}/custom-fields/${field.id}`,{...base,revision:updated.data.revision,addOption:'tối thứ 7',value:'tối thứ 7'});
      assert.equal(repeated.response.status,200);assert.equal(repeated.data.profile.customFields.find(item=>item.id===field.id).options.length,3);
      const fresh=learning.getStudentSummary(FIXTURE.pageId,studentId);
      assert.notEqual(fresh.legacyRevision,oldSummary.legacyRevision);
      assert.equal(fresh.legacyCustomFields.find(item=>item.id===field.id).value,'Tối thứ 7');
      const {formatStudentContext}=await import('../dist/services/promptStudentContext.js');
      const promptInput={studentName:'Student B',revision:fresh.revision,historyCoverage:fresh.historyCoverage,
        facts:[],issueReferences:[],attributes:fresh.legacyCustomFields.filter(item=>item.useInSuggestions&&item.value)
          .map(item=>({id:item.id,name:item.name,value:item.value}))};
      assert.match(formatStudentContext(promptInput,false).text,/Ca học: Tối thứ 7/);
      assert.doesNotMatch(formatStudentContext(promptInput,true).text,/Ca học: Tối thứ 7/);
      const invalid=await send('PATCH',`/api/students/${studentId}/custom-fields/${field.id}`,{...base,revision:repeated.data.revision,value:'Không có'});
      assert.equal(invalid.response.status,400);
    });
    await t.test('timeline pages retain every quote for their own occurrences', () => {
      const issueId = 'pagination-issue';
      db.prepare(`INSERT INTO student_issues(id,student_id,title,normalized_title,summary,status,revision,created_at,updated_at)
        VALUES (?,?,'Pagination','pagination','','active',1,?,?)`).run(issueId, FIXTURE.studentB, '2026-09-01', '2026-09-01');
      for (let index = 0; index < 3; index++) {
        const occurrenceId = `page-occurrence-${index}`;
        db.prepare(`INSERT INTO issue_occurrences(id,issue_id,occurred_at,source_kind,approved,source_key,created_by,created_at)
          VALUES (?, ?, ?, 'staff_confirmed', 1, ?, 'qa', ?)`).run(occurrenceId, issueId, `2026-09-${10 + index}T00:00:00.000Z`, occurrenceId, '2026-09-01');
        // Quotes deliberately have different dates and more than five rows per
        // occurrence, exposing pagination by evidence offsets instead of mốc IDs.
        for (let quote = 0; quote < 8; quote++) {
          const messageId = `${occurrenceId}-${quote}`;
          db.prepare(`INSERT INTO conversation_message_cache(page_id,conversation_id,message_id,sender,sender_name,text,created_at)
            VALUES (?, ?, ?, 'staff', 'Teacher', ?, ?)`).run(FIXTURE.pageId, FIXTURE.conversationTeacher, messageId, `quote ${quote}`, '2026-08-01T00:00:00.000Z');
          db.prepare(`INSERT INTO issue_evidence
            (id,occurrence_id,issue_id,conversation_id,message_id,speaker,verbatim_text,occurred_at,created_at)
            VALUES (?,?,?,?,?,'Teacher',?,?,?)`).run(messageId, occurrenceId, issueId, FIXTURE.conversationTeacher, messageId,
              `quote ${quote}`, '2026-08-01T00:00:00.000Z', '2026-09-01');
        }
      }
      for (let offset = 0; offset < 3; offset++) {
        const result = learning.getIssueDetail(FIXTURE.pageId, FIXTURE.studentB, issueId, 1, offset);
        assert.equal(result.occurrences.length, 1);
        assert.equal(result.evidence.length, 8);
        assert.ok(result.evidence.every((quote) => quote.occurrenceId === result.occurrences[0].id));
        assert.equal(result.hasMore, offset < 2);
      }
    });
    await t.test('accepting an edited issue proposal preserves the named sender and edited summary', () => {
      const created = proposals.createProposal({ pageId: FIXTURE.pageId, studentId: FIXTURE.studentB, staffId: FIXTURE.staffId,
        kind: 'issue', payload: { title: 'Original title', summary: 'Original summary' }, sourceConversationId: FIXTURE.conversationTeacher,
        sourceMessageId: FIXTURE.messageTeacher, sourceText: 'Keep your wrist relaxed.', sourceOccurredAt: '2026-09-20T12:00:00.000Z' });
      const proposal = created.items.find((item) => item.payload.title === 'Original title');
      assert.ok(proposal);
      proposals.decideProposal({ pageId: FIXTURE.pageId, studentId: FIXTURE.studentB, staffId: FIXTURE.staffId,
        proposalId: proposal.id, action: 'accept', title: 'Edited title', content: 'Edited teacher summary' });
      const issue = learning.listIssues(FIXTURE.pageId, FIXTURE.studentB).items.find((item) => item.title === 'Edited title');
      assert.equal(issue.summary, 'Edited teacher summary');
      const detail = learning.getIssueDetail(FIXTURE.pageId, FIXTURE.studentB, issue.id);
      assert.equal(detail.evidence[0].speaker, 'Teacher');
      assert.equal(detail.evidence[0].verbatimText, 'Keep your wrist relaxed.');
    });
    await t.test('resolution proposals require teacher evidence rather than student self-report', () => {
      const studentClaim=proposals.createProposal({pageId:FIXTURE.pageId,studentId:FIXTURE.studentB,staffId:FIXTURE.staffId,
        kind:'resolution',payload:{issueTitle:'Relax wrist'},sourceConversationId:FIXTURE.conversationShared,
        sourceMessageId:FIXTURE.messageB,sourceText:'I practiced scales before the piano recital Saturday.'});
      const pending=studentClaim.items.find(item=>item.kind==='resolution');
      assert.throws(()=>proposals.decideProposal({pageId:FIXTURE.pageId,studentId:FIXTURE.studentB,staffId:FIXTURE.staffId,proposalId:pending.id,action:'accept'}),error=>error.code==='RESOLUTION_SOURCE_UNVERIFIED');
      assert.equal(learning.listIssues(FIXTURE.pageId,FIXTURE.studentB,'all').items.find(item=>item.title==='Relax wrist').status,'active');
    });
    await t.test('day-based assignment durations refresh even without a student revision change', () => {
      const summary = learning.getStudentSummary(FIXTURE.pageId, FIXTURE.studentB);
      const stale = { ...summary, assignments: summary.assignments.map((assignment) => ({ ...assignment, durationLabel: 'stale days' })) };
      db.prepare('UPDATE student_summary_snapshots SET payload_json=?,generated_at=? WHERE student_id=?')
        .run(JSON.stringify(stale), '2026-01-01T00:00:00.000Z', FIXTURE.studentB);
      const refreshed = learning.getStudentSummary(FIXTURE.pageId, FIXTURE.studentB);
      assert.equal(refreshed.revision, summary.revision);
      assert.ok(refreshed.assignments.every((assignment) => assignment.durationLabel !== 'stale days'));
    });
    await t.test('editing completed work preserves its completion date', () => {
      const created=learning.createAssignment({pageId:FIXTURE.pageId,studentId:FIXTURE.studentB,title:'Completed melody'});
      db.prepare(`UPDATE student_assignments SET status='completed',completed_at=? WHERE id=?`).run('2026-09-25T00:00:00.000Z',created.id);
      const assignment=learning.listAssignments(FIXTURE.pageId,FIXTURE.studentB).find((item)=>item.id===created.id);
      const updated=learning.updateAssignment({pageId:FIXTURE.pageId,studentId:FIXTURE.studentB,assignmentId:created.id,
        revision:assignment.revision,title:'Completed melody corrected title'});
      assert.equal(updated.items.find((item)=>item.id===created.id).completedAt,'2026-09-25T00:00:00.000Z');
    });
    await t.test('cached source navigation works for old conversations and enforces page access', async () => {
      const url = `${origin}/api/conversations/${FIXTURE.conversationTeacher}/source-context?pageId=${FIXTURE.pageId}&messageId=${FIXTURE.messageTeacher}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.conversation.id, FIXTURE.conversationTeacher);
      assert.ok(data.items.some((item) => item.id === FIXTURE.messageTeacher && item.text === 'Keep your wrist relaxed.'));
      const otherToken = issueAppSession({ userId: 'other-staff', pageId: 'other-page-test' });
      assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${otherToken}` } })).status, 403);
    });
    await t.test('source selectors use historical ownership for shared accounts', async () => {
      const query = new URLSearchParams({ pageId: FIXTURE.pageId, messageIds: [FIXTURE.messageAOld, FIXTURE.messageB].join(',') });
      const response = await fetch(`${origin}/api/conversations/${FIXTURE.conversationShared}/student-messages?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.items.find((item) => item.messageId === FIXTURE.messageAOld).studentId, FIXTURE.studentA);
      assert.equal(data.items.find((item) => item.messageId === FIXTURE.messageB).studentId, FIXTURE.studentB);
      db.prepare(`INSERT INTO conversation_message_cache(page_id,conversation_id,message_id,sender,text,created_at)
        VALUES (?,?,?,'student','Unassigned old clip','2025-01-01T00:00:00.000Z')`).run(FIXTURE.pageId, FIXTURE.conversationShared, 'unassigned-source');
      const mixedQuery=new URLSearchParams({pageId:FIXTURE.pageId,messageIds:'unassigned-source,message-b'});
      const mixed=await fetch(`${origin}/api/conversations/${FIXTURE.conversationShared}/student-messages?${mixedQuery}`,{headers:{Authorization:`Bearer ${token}`}});
      assert.equal(mixed.status,200);
      const mixedData=await mixed.json();
      assert.equal(mixedData.items.find((item)=>item.messageId==='unassigned-source').studentId,null);
      assert.equal(mixedData.items.find((item)=>item.messageId===FIXTURE.messageB).studentId,FIXTURE.studentB);
    });
    await t.test('restarting repairs synthetic open links without changing confirmed historical ownership', () => {
      db.prepare(`INSERT INTO student_conversation_link_history
        (id,page_id,conversation_id,student_id,valid_from,valid_to,source,confirmed_by)
        VALUES (?,?,?,?,?,NULL,'legacy_link','qa')`).run('link-history:bad-open', FIXTURE.pageId, FIXTURE.conversationShared, FIXTURE.studentB, '2026-09-01T00:00:00.000Z');
      db.prepare(`INSERT INTO student_conversation_link_history
        (id,page_id,conversation_id,student_id,valid_from,valid_to,source,confirmed_by)
        VALUES (?,?,?,?,?,?,'legacy_link','qa')`).run('link-history:closed-to-preserve', FIXTURE.pageId, FIXTURE.conversationShared,
          FIXTURE.studentA, '2025-01-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z');
      const identityUrl = new URL('../dist/services/studentIdentityService.js', import.meta.url).href;
      const dbUrl = new URL('../dist/db/index.js', import.meta.url).href;
      const code = `const {getEffectiveMessageStudent}=await import(${JSON.stringify(identityUrl)});
        const {getDatabase}=await import(${JSON.stringify(dbUrl)});const db=getDatabase();
        console.log(JSON.stringify({old:getEffectiveMessageStudent('page-test','conversation-shared','message-a-old'),
          new:getEffectiveMessageStudent('page-test','conversation-shared','message-b'),
          open:db.prepare("SELECT COUNT(*) AS n FROM student_conversation_link_history WHERE source='legacy_link' AND valid_to IS NULL").get().n,
          closed:db.prepare("SELECT COUNT(*) AS n FROM student_conversation_link_history WHERE id='link-history:closed-to-preserve'").get().n}));db.close();`;
      const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: process.env, encoding: 'utf8' }).trim());
      assert.equal(result.old, FIXTURE.studentA); assert.equal(result.new, FIXTURE.studentB);
      assert.equal(result.open, 0); assert.equal(result.closed, 1);
    });
    await t.test('a submission stays pending until its review is confirmed sent', () => {
      const input = { pageId: FIXTURE.pageId, studentId: FIXTURE.studentB, staffId: FIXTURE.staffId,
        conversationId: FIXTURE.conversationShared, sourceMessageId: FIXTURE.messageStudent, assignmentId: FIXTURE.assignment,
        teacherInput: 'Keep a steady rhythm.', clientKey: 'pending-to-confirmed-test' };
      learning.createSubmission({ ...input, messageId: input.sourceMessageId });
      const review = learning.createReviewSession(input);
      assert.equal(learning.listSubmissions(input.pageId, input.studentId).find((item) => item.sourceMessageId === input.sourceMessageId).status, 'pending');
      assert.equal(learning.createReviewSession(input).id, review.id);
      learning.confirmReviewSession({ ...input, reviewSessionId: review.id, confirmed: true });
      assert.equal(learning.listSubmissions(input.pageId, input.studentId).find((item) => item.sourceMessageId === input.sourceMessageId).status, 'reviewed');
      learning.confirmReviewSession({ ...input, reviewSessionId: review.id, confirmed: false });
      assert.equal(learning.listSubmissions(input.pageId, input.studentId).find((item) => item.sourceMessageId === input.sourceMessageId).status, 'pending');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close(); fs.rmSync(temporary, { recursive: true, force: true });
  }
});
