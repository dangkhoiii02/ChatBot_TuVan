import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { FIXTURE, seedAdversarialFixtures } from './adversarial-fixtures.mjs';

const backendDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'backend-fixes-'));
const databasePath=path.join(tempDir,'app.sqlite');
process.env.BACKEND_DATABASE_PATH=databasePath;
process.env.NODE_ENV='test';
process.env.APP_SESSION_SECRET='backend-qa-integration-secret';
process.env.PANCAKE_PAGE_ID=FIXTURE.pageId;
process.env.PANCAKE_PAGE_ACCESS_TOKEN='fake-pancake-token-for-tests-only';
process.env.ALLOW_DEMO_MODE='0';

const [{getDatabase},{createApp},{issueAppSession},{linkConversation,rememberMessages,getEffectiveMessageStudent},
  {createFact,addIssueOccurrence,listIssues,getStudentSummary,createAssignment,listAssignments,createReviewSession},
  {processHistoryBackfillPage,enqueueHistoryBackfill},{updateStudentContext,getStudentContext}]=await Promise.all([
  import('../dist/db/index.js'),import('../dist/app.js'),import('../dist/services/sessionToken.js'),
  import('../dist/services/studentIdentityService.js'),import('../dist/services/studentLearningService.js'),
  import('../dist/services/historyBackfillService.js'),import('../dist/services/studentContextService.js')
]);

test('backend FIX-001..013 acceptance and adversarial integration', {timeout:120_000}, async(t)=>{
  const db=getDatabase();
  seedAdversarialFixtures(db);
  const server=http.createServer(createApp());
  const studentA=FIXTURE.studentA;
  const studentB=FIXTURE.studentB;
  const studentOtherPage=FIXTURE.studentOtherPage;
  const sourceTeacherMessage=FIXTURE.messageTeacher;
  let origin='';
  const token=issueAppSession({userId:FIXTURE.staffId,pageId:FIXTURE.pageId});
  const api=async(pathname,body,auth=token)=>{
    const method=body===undefined?'GET':(/\/facts\/[^/]+$|\/assignments\/[^/]+$|\/issues\/[^/]+\/occurrences\/[^/]+$/.test(pathname)?'PATCH':'POST');
    const response=await fetch(`${origin}${pathname}`,{method,headers:{...(auth?{Authorization:`Bearer ${auth}`}:{}) ,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data={};try{data=await response.json()}catch{}
    return {status:response.status,data};
  };
  const addConversation=(id,customerId=FIXTURE.customerId)=>db.prepare(`INSERT INTO conversations(id,page_id,customer_id,customer_name,last_message,updated_at)
    VALUES (?,?,?,'QA learner','',?)`).run(id,FIXTURE.pageId,customerId,new Date().toISOString());
  const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
  const count=(sql,...args)=>Number((db.prepare(sql).get(...args)||{}).count||0);
  const runServiceProcess=(payload)=>new Promise((resolve,reject)=>{
    const learningUrl=new URL('../dist/services/studentLearningService.js',import.meta.url).href;
    const childCode=`const payload=JSON.parse(process.env.QA_PAYLOAD);const service=await import(${JSON.stringify(learningUrl)});let result;
      if(payload.type==='review') result=service.createReviewSession(payload.input);
      else result=service.addIssueOccurrence(payload.input);console.log(JSON.stringify(payload.type==='review'?{id:result.id}:{occurrenceId:result.occurrenceId,issueId:result.issueId}));`;
    const child=spawn(process.execPath,['--input-type=module','-e',childCode],{env:{...process.env,QA_PAYLOAD:JSON.stringify(payload)},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.setEncoding('utf8').on('data',(value)=>stdout+=value);child.stderr.setEncoding('utf8').on('data',(value)=>stderr+=value);
    child.once('error',reject);child.once('close',(code)=>{
      if(code!==0) return reject(new Error(`concurrent service process failed (${code}): ${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split('\n').at(-1))); } catch(error) { reject(new Error(`invalid subprocess result: ${stdout}\n${stderr}`)); }
    });
  });
  try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  await t.test('stable fixtures and real signed staff session are available',async()=>{
    assert.equal((await api(`/api/students/${studentA}/summary`)).status,200);
    assert.equal(db.prepare('SELECT customer_id FROM conversations WHERE id=?').get(FIXTURE.conversationShared).customer_id,FIXTURE.customerId);
    assert.equal(count('SELECT COUNT(*) AS count FROM student_conversation_link_history WHERE page_id=? AND conversation_id=?',FIXTURE.pageId,FIXTURE.conversationShared),2);
    assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,FIXTURE.conversationShared,FIXTURE.messageAOld),studentA);
    assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,FIXTURE.conversationShared,FIXTURE.messageANew),studentA);
    assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,FIXTURE.conversationShared,FIXTURE.messageB),studentB);
    assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,FIXTURE.conversationShared,FIXTURE.messageStudent),studentB);
    assert.equal(db.prepare('SELECT sender FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?')
      .get(FIXTURE.pageId,FIXTURE.conversationTeacher,FIXTURE.messageTeacher).sender,'staff');
    for(const id of [FIXTURE.factPrivateEvent,FIXTURE.factNormalEvent,FIXTURE.factLearningNote,
      FIXTURE.factPreferenceLan,FIXTURE.factPreferenceMai])
      assert.equal(count('SELECT COUNT(*) AS count FROM student_facts WHERE id=?',id),1);
    assert.equal(count('SELECT COUNT(*) AS count FROM student_assignments WHERE id=?',FIXTURE.assignment),1);
    assert.equal(count('SELECT COUNT(*) AS count FROM student_review_sessions WHERE id=?',FIXTURE.reviewSession),1);
    assert.equal(count('SELECT COUNT(*) AS count FROM student_issues WHERE id=?',FIXTURE.issue),1);
    assert.equal(count('SELECT COUNT(*) AS count FROM issue_occurrences WHERE id=?',FIXTURE.occurrence),1);
    assert.equal(count('SELECT COUNT(*) AS count FROM issue_evidence WHERE id=?',FIXTURE.evidence),1);
    assert.equal(db.prepare('SELECT oldest_cursor AS cursor FROM conversation_sync_state WHERE page_id=? AND conversation_id=?')
      .get(FIXTURE.pageId,FIXTURE.conversationShared).cursor,FIXTURE.historyCursor);
  });
  await t.test('grading rejects stale context and keeps same-title assignments separate',async()=>{
    const revision=getStudentSummary(FIXTURE.pageId,studentB).revision;
    const stale=await api('/api/suggestions',{conversationId:FIXTURE.conversationShared,studentId:studentB,
      contextRevision:revision+1,mode:'teacher_review',teacherInput:'Keep a steady rhythm.',
      sourceMessageId:FIXTURE.messageB,reviewSessionKey:'stale-review-key',provider:'mock'});
    assert.equal(stale.status,409);
    assert.equal(stale.data.code,'STUDENT_CONTEXT_STALE');
    const base={pageId:FIXTURE.pageId,studentId:studentB,conversationId:FIXTURE.conversationShared,
      sourceMessageId:FIXTURE.messageB,teacherInput:'Keep a steady rhythm.',assignmentTitle:'Major scales',staffId:FIXTURE.staffId};
    const first=createReviewSession({...base,clientKey:'same-title-new-a'});
    const retried=createReviewSession({...base,clientKey:'same-title-new-a'});
    const second=createReviewSession({...base,clientKey:'same-title-new-b'});
    assert.equal(first.id,retried.id);
    const rows=db.prepare(`SELECT assignment_id AS assignmentId FROM student_review_sessions WHERE id IN (?,?)`)
      .all(first.id,second.id);
    assert.equal(rows.length,2);
    assert.notEqual(rows[0].assignmentId,rows[1].assignmentId);
    assert.ok(rows.every((row)=>row.assignmentId!==FIXTURE.assignment));
  });
  await t.test('proposal extraction resumes at new cached rows, including older backfill',async()=>{
    const {extractProposals,runProposalExtractionBatch}=await import('../dist/services/studentProposalService.js');
    const previous=Object.fromEntries(['AI_PROVIDER','AI_API_KEY','AI_MODEL','AI_BASE_URL','OPENAI_BASE_URL'].map((key)=>[key,process.env[key]]));
    const originalFetch=globalThis.fetch;
    const prompts=[];
    Object.assign(process.env,{AI_PROVIDER:'openai',AI_API_KEY:'qa-key',AI_MODEL:'gpt-4o',AI_BASE_URL:'https://capture.invalid/v1',OPENAI_BASE_URL:'https://capture.invalid/v1'});
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('https://capture.invalid/')) {
        const prompt=JSON.parse(options.body).messages.at(-1).content;
        prompts.push(prompt);
        const result={intent:'check_in',sensitivity:'xanh',analysis:'QA',replies:[{tone:'neutral',content:'QA'}],proposals:[]};
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      return originalFetch(url,options);
    };
    try {
      const first=await extractProposals({pageId:FIXTURE.pageId,studentId:studentB,conversationId:FIXTURE.conversationTeacher});
      assert.equal(first.sourceMessageCount,1);
      const repeated=await extractProposals({pageId:FIXTURE.pageId,studentId:studentB,conversationId:FIXTURE.conversationTeacher});
      assert.equal(repeated.sourceMessageCount,0);
      rememberMessages(FIXTURE.pageId,FIXTURE.conversationTeacher,[{id:'backfilled-older-for-extraction',sender:'student',
        text:'A newly discovered older practice note.',createdAt:'2026-09-19T12:00:00.000Z'}]);
      const backfilled=await extractProposals({pageId:FIXTURE.pageId,studentId:studentB,conversationId:FIXTURE.conversationTeacher});
      assert.equal(backfilled.sourceMessageCount,1);
      assert.equal(prompts.length,2);
      assert.ok(prompts[1].includes('backfilled-older-for-extraction'));
      rememberMessages(FIXTURE.pageId,FIXTURE.conversationTeacher,[{id:'automatic-extraction-message',sender:'student',
        text:'A new practice note for automatic extraction.',createdAt:'2026-09-21T12:00:00.000Z'}]);
      const automatic=await runProposalExtractionBatch();
      assert.equal(automatic.status,'complete');
      assert.equal(automatic.processed,1);
      assert.equal(prompts.length,3);
      assert.ok(prompts[2].includes('automatic-extraction-message'));
      const historical=await extractProposals({pageId:FIXTURE.pageId,studentId:studentA,conversationId:FIXTURE.conversationShared});
      assert.equal(historical.sourceMessageCount,2);
      assert.ok(prompts[3].includes(FIXTURE.messageAOld));
      assert.equal(prompts[3].includes(FIXTURE.messageB),false);
    } finally {
      globalThis.fetch=originalFetch;
      for(const [key,value] of Object.entries(previous)) {
        if(value===undefined) delete process.env[key]; else process.env[key]=value;
      }
    }
  });
  await t.test('FIX-002 / T01: old and new messages retain A/B ownership after conversation relink',async()=>{
      addConversation('identity-relink-conversation');
      const linkedA=linkConversation({pageId:FIXTURE.pageId,conversationId:'identity-relink-conversation',studentId:studentA,staffId:FIXTURE.staffId});
      await wait(15);
      const aAt=new Date().toISOString();
      rememberMessages(FIXTURE.pageId,'identity-relink-conversation',[{id:'message-a-live',sender:'student',senderName:'Student A',text:'A submitted the piano scale.',createdAt:aAt}]);
      await wait(15);
      const linkedB=linkConversation({pageId:FIXTURE.pageId,conversationId:'identity-relink-conversation',studentId:studentB,staffId:FIXTURE.staffId});
      await wait(15);
      const bAt=new Date().toISOString();
      rememberMessages(FIXTURE.pageId,'identity-relink-conversation',[{id:'message-b-live',sender:'student',senderName:'Student B',text:'I practiced scales before recital Saturday.',createdAt:bAt}]);
      assert.equal(linkedA.student.id,studentA);
      assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,'identity-relink-conversation','message-a-live'),studentA);
      assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,'identity-relink-conversation','message-b-live'),studentB);
      addConversation('boundary-conversation');
      linkConversation({pageId:FIXTURE.pageId,conversationId:'boundary-conversation',studentId:studentA,staffId:FIXTURE.staffId});
      linkConversation({pageId:FIXTURE.pageId,conversationId:'boundary-conversation',studentId:studentB,staffId:FIXTURE.staffId});
      const boundary='2026-09-23T10:00:00.500Z';
      db.prepare(`UPDATE student_conversation_link_history SET valid_from='2026-09-23T09:00:00.000Z',valid_to=?
        WHERE page_id='page-test' AND conversation_id='boundary-conversation' AND student_id=?`).run(boundary,studentA);
      db.prepare(`UPDATE student_conversation_link_history SET valid_from=?,valid_to=NULL
        WHERE page_id='page-test' AND conversation_id='boundary-conversation' AND student_id=?`).run(boundary,studentB);
      rememberMessages(FIXTURE.pageId,'boundary-conversation',[{id:'boundary-old',sender:'student',text:'Before the relink by half a second.',createdAt:'2026-09-23T10:00:00Z'}]);
      assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,'boundary-conversation','boundary-old'),studentA);
      rememberMessages(FIXTURE.pageId,FIXTURE.conversationShared,[{id:FIXTURE.messageAOld,sender:'staff',senderName:'Edited sender metadata',
        text:'Pancake returned edited text for the same message ID.',createdAt:'2026-09-20T10:00:00.000Z'}]);
      const edited=db.prepare(`SELECT sender,sender_name AS senderName,text,created_at AS createdAt FROM conversation_message_cache
        WHERE page_id=? AND conversation_id=? AND message_id=?`).get(FIXTURE.pageId,FIXTURE.conversationShared,FIXTURE.messageAOld);
      assert.equal(count('SELECT COUNT(*) AS count FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?',
        FIXTURE.pageId,FIXTURE.conversationShared,FIXTURE.messageAOld),1);
      assert.equal(edited.sender,'student');
      assert.equal(edited.createdAt,'2026-09-01T10:00:00.000Z');
      assert.equal(edited.senderName,'Edited sender metadata');
      assert.equal(edited.text,'Pancake returned edited text for the same message ID.');
      assert.equal(getEffectiveMessageStudent(FIXTURE.pageId,FIXTURE.conversationShared,FIXTURE.messageAOld),studentA);
      const wrongOwner=await api(`/api/students/${studentB}/submissions`,{conversationId:'conversation-shared',messageId:'message-a-old'});
      assert.equal(wrongOwner.status,409);
      assert.equal(count('SELECT COUNT(*) AS count FROM student_submissions WHERE student_id=?',studentB),0);
      assert.equal((await import('../dist/services/studentIdentityService.js')).listCachedMessagesForStudent('page-test','boundary-conversation',studentB,10)
        .some((message)=>message.id==='boundary-old'),false);
      const crossPage=await api(`/api/students/${studentOtherPage}/summary`);
      assert.equal(crossPage.status,404);
      assert.equal((await api(`/api/students/${studentA}/summary`,undefined,null)).status,401);
    });

    await t.test('FIX-001 / T02 / T13: private event is absent from captured prompt and usedFacts; approved relevant event is auditable',async()=>{
      for(let index=1;index<=13;index++) createFact({pageId:FIXTURE.pageId,studentId:studentB,staffId:FIXTURE.staffId,
        kind:'learning_note',content:`QA prompt fact ${index}`,useInSuggestions:true});
      db.prepare('UPDATE student_facts SET created_at=? WHERE id=?').run('2099-01-01T00:00:00.000Z',FIXTURE.factNormalEvent);
      const originalFetch=globalThis.fetch;
      const captures=[];
      globalThis.fetch=async(url,options)=>{
        if(String(url).startsWith('https://capture.invalid/')) {
          captures.push(JSON.parse(options.body));
          const result={intent:'assignment_feedback',sensitivity:'vang',flag_reason:'QA',analysis:'QA result',
            replies:[{tone:'Warm',content:'Good work.'},{tone:'Clear',content:'Try again.'},{tone:'Encourage',content:'Keep going.'}]};
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(url,options);
      };
      try {
        const result=await api('/api/suggestions',{conversationId:'conversation-shared',studentId:studentB,mode:'chat',
          sourceMessageId:'message-b',teacherInput:'Give a careful scale practice note.',
          messages:[{id:'message-b',sender:'student',text:'client-forged text must not replace cached source'}],
          provider:'openai',baseUrl:'https://capture.invalid/v1',apiKey:'qa-key',model:'gpt-4o'});
        assert.equal(result.status,200,JSON.stringify(result.data));
        assert.equal(captures.length,1);
        const prompt=captures[0].messages.map((message)=>message.content).join('\n');
        assert.equal(prompt.includes('Confidential family court hearing'),false);
        assert.equal(prompt.includes('Piano recital on Saturday'),true,JSON.stringify(result.data.usedFacts));
        assert.equal(prompt.includes('A submitted the piano scale.'),false);
        assert.equal(prompt.includes('I practiced scales before the piano recital Saturday.'),true);
        assert.equal(prompt.includes('client-forged text'),false);
        assert.equal(result.data.usedFacts.some((fact)=>fact.content==='Confidential family court hearing'),false);
        assert.equal(result.data.usedFacts.some((fact)=>fact.content==='Piano recital on Saturday'),true);
        assert.equal(result.data.usedFacts.length,12);
        for(const fact of result.data.usedFacts) {
          assert.equal(prompt.includes(`[${fact.id}; ${fact.kind};`),true,`used fact ${fact.id} must be in the outbound prompt`);
          assert.equal(prompt.includes(fact.content),true,`used fact content ${fact.id} must be in the outbound prompt`);
        }
        const promptFactIds=[...prompt.matchAll(/\[(fact-[^;\]]+); [^\]]+\]/g)].map((match)=>match[1]);
        assert.deepEqual(promptFactIds,result.data.usedFacts.map((fact)=>fact.id));
        const generation=db.prepare(`SELECT context_json AS context FROM generations ORDER BY created_at DESC LIMIT 1`).get();
        const context=JSON.parse(generation.context);
        assert.equal(context.usedFactIds.length,result.data.usedFacts.length);
        assert.deepEqual(new Set(context.usedFactIds),new Set(result.data.usedFacts.map((fact)=>fact.id)));
      } finally { globalThis.fetch=originalFetch; }
      addConversation('unmapped-conversation','customer-test');
      rememberMessages('page-test','unmapped-conversation',[{id:'unmapped-msg',sender:'student',text:'Private unassigned student message',createdAt:new Date().toISOString()}]);
      const priorSessions=count(`SELECT COUNT(*) AS count FROM student_review_sessions`);
      const savedFetch=globalThis.fetch;let unresolvedPrompt='';
      globalThis.fetch=async(url,options)=>{
        if(String(url).startsWith('https://capture.invalid/')) {
          unresolvedPrompt=JSON.parse(options.body).messages.map((message)=>message.content).join('\n');
          const result={intent:'assignment_feedback',sensitivity:'vang',flag_reason:'QA',analysis:'No identity context',
            replies:[{tone:'Warm',content:'Good work.'},{tone:'Clear',content:'Try again.'},{tone:'Encourage',content:'Keep going.'}]};
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return savedFetch(url,options);
      };
      try {
        const unresolved=await api('/api/suggestions',{conversationId:'unmapped-conversation',mode:'teacher_review',teacherInput:'Give wording only.',
          messages:[{id:'unmapped-msg',sender:'student',text:'forged body text'},],provider:'openai',baseUrl:'https://capture.invalid/v1',apiKey:'qa-key',model:'gpt-4o'});
        assert.equal(unresolved.status,200,JSON.stringify(unresolved.data));
        assert.equal(unresolved.data.identityStatus,'needs_selection');
        assert.equal(unresolved.data.reviewSessionId,null);
        assert.equal(unresolvedPrompt.includes('Private unassigned student message'),false);
        assert.equal(unresolvedPrompt.includes('forged body text'),false);
        assert.equal(count(`SELECT COUNT(*) AS count FROM student_review_sessions`),priorSessions);
      } finally { globalThis.fetch=savedFetch; }
      const noKey=await api(`/api/students/${studentB}/review-sessions`,{conversationId:'conversation-shared',teacherInput:'Missing key',sourceMessageId:'message-b'});
      assert.equal(noKey.status,400);
    });

    await t.test('FIX-007 / REGRESSION-002: provider or final DB failure leaves no partial mutation; retry is idempotent',async()=>{
      const request={conversationId:FIXTURE.conversationShared,studentId:studentB,mode:'teacher_review',
        sourceMessageId:FIXTURE.messageB,reviewSessionKey:'provider-failure-retry',teacherInput:'Review the scale practice.',
        assignmentTitle:'Provider rollback assignment',messages:[{id:FIXTURE.messageB,sender:'student',text:'untrusted client copy'}],
        provider:'openai',baseUrl:'https://capture.invalid/v1',apiKey:'qa-mock-key',model:'gpt-4o'};
      const generationCount=()=>count('SELECT COUNT(*) AS count FROM generations');
      const beforeGenerations=generationCount();
      db.prepare('DELETE FROM student_summary_snapshots WHERE student_id=?').run(studentB);
      const originalFetch=globalThis.fetch;
      let attempts=0;
      globalThis.fetch=async(url,options)=>{
        if(String(url).startsWith('https://capture.invalid/')) {
          attempts++;
          if(attempts===1) return new Response(JSON.stringify({error:{message:'mock provider rejected request'}}),
            {status:400,headers:{'Content-Type':'application/json'}});
          const result={intent:'assignment_feedback',sensitivity:'vang',flag_reason:'QA',analysis:'QA result',
            replies:[{tone:'Warm',content:'Good work.'},{tone:'Clear',content:'Try again.'},{tone:'Encourage',content:'Keep going.'}]};
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),
            {status:200,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(url,options);
      };
      try {
        const failed=await api('/api/suggestions',request);
        assert.equal(failed.status,502,JSON.stringify(failed.data));
        assert.equal(count('SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND client_key=?',studentB,request.reviewSessionKey),0);
        assert.equal(count(`SELECT COUNT(*) AS count FROM student_assignments WHERE student_id=? AND normalized_title='provider rollback assignment'`,studentB),0);
        assert.equal(generationCount(),beforeGenerations);
        assert.equal(count('SELECT COUNT(*) AS count FROM student_summary_snapshots WHERE student_id=?',studentB),0);

        const first=await api('/api/suggestions',request);
        assert.equal(first.status,200,JSON.stringify(first.data));
        assert.deepEqual(first.data.usedFacts,[]);
        assert.equal(attempts,2);
        assert.equal(count('SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND client_key=?',studentB,request.reviewSessionKey),1);
        assert.equal(count(`SELECT COUNT(*) AS count FROM student_assignments WHERE student_id=? AND normalized_title='provider rollback assignment'`,studentB),1);
        const auditRows=db.prepare(`SELECT context_json AS context FROM generations WHERE conversation_id=? AND context_json LIKE ?`)
          .all(FIXTURE.conversationShared,'%provider-failure-retry%');
        assert.equal(auditRows.length,1);
        for(const row of auditRows) {
          assert.equal(JSON.parse(row.context).reviewSessionId,first.data.reviewSessionId);
          assert.deepEqual(JSON.parse(row.context).usedFactIds,[]);
        }

        const dbFailureRequest={...request,reviewSessionKey:'provider-success-db-failure',assignmentTitle:'DB rollback assignment'};
        db.exec(`CREATE TRIGGER qa_fail_generation_insert BEFORE INSERT ON generations BEGIN SELECT RAISE(ABORT,'QA generation write failure'); END;`);
        const beforeDbFailure={
          sessions:count('SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND client_key=?',studentB,dbFailureRequest.reviewSessionKey),
          assignments:count(`SELECT COUNT(*) AS count FROM student_assignments WHERE student_id=? AND normalized_title='db rollback assignment'`,studentB),
          generations:generationCount(),audits:count('SELECT COUNT(*) AS count FROM student_audit_events WHERE student_id=?',studentB),
          revision:db.prepare('SELECT revision FROM students WHERE id=?').get(studentB).revision,
          snapshots:count('SELECT COUNT(*) AS count FROM student_summary_snapshots WHERE student_id=?',studentB)
        };
        try {
          const failedPersistence=await api('/api/suggestions',dbFailureRequest);
          assert.equal(failedPersistence.status,500,JSON.stringify(failedPersistence.data));
          const afterDbFailure={
            sessions:count('SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND client_key=?',studentB,dbFailureRequest.reviewSessionKey),
            assignments:count(`SELECT COUNT(*) AS count FROM student_assignments WHERE student_id=? AND normalized_title='db rollback assignment'`,studentB),
            generations:generationCount(),audits:count('SELECT COUNT(*) AS count FROM student_audit_events WHERE student_id=?',studentB),
            revision:db.prepare('SELECT revision FROM students WHERE id=?').get(studentB).revision,
            snapshots:count('SELECT COUNT(*) AS count FROM student_summary_snapshots WHERE student_id=?',studentB)
          };
          assert.deepEqual(afterDbFailure,beforeDbFailure);
        } finally { db.exec('DROP TRIGGER IF EXISTS qa_fail_generation_insert'); }
      } finally { globalThis.fetch=originalFetch; }
    });

    await t.test('FIX-003 / T03: source quote and sender are bound to cached message, failed writes leave no rows',async()=>{
      const before={
        issues:count('SELECT COUNT(*) AS count FROM student_issues WHERE student_id=?',studentB),
        occurrences:count(`SELECT COUNT(*) AS count FROM issue_occurrences o JOIN student_issues i ON i.id=o.issue_id WHERE i.student_id=?`,studentB),
        evidence:count(`SELECT COUNT(*) AS count FROM issue_evidence e JOIN student_issues i ON i.id=e.issue_id WHERE i.student_id=?`,studentB),
        actions:count(`SELECT COUNT(*) AS count FROM issue_practice_actions a JOIN student_issues i ON i.id=a.issue_id WHERE i.student_id=?`,studentB)
      };
      const noSource=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Unsourced teacher evidence',occurredAt:new Date().toISOString(),
        sourceKind:'teacher_confirmed',speaker:'Teacher',verbatimText:'Invented teacher quote',practiceAction:'Invented prescription'});
      assert.equal(noSource.status,400);
      const fakeSourceKind=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Fake source kind',occurredAt:new Date().toISOString(),
        sourceKind:'teacher',speaker:'Teacher',verbatimText:'Invented quote'});
      assert.equal(fakeSourceKind.status,400);
      const studentAsTeacher=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Student mislabeled as teacher',occurredAt:new Date().toISOString(),
        sourceKind:'teacher_confirmed',conversationId:'conversation-shared',messageId:'message-b',speaker:'Student B',
        verbatimText:'I practiced scales'});
      assert.equal(studentAsTeacher.status,400);
      assert.deepEqual({
        issues:count('SELECT COUNT(*) AS count FROM student_issues WHERE student_id=?',studentB),
        occurrences:count(`SELECT COUNT(*) AS count FROM issue_occurrences o JOIN student_issues i ON i.id=o.issue_id WHERE i.student_id=?`,studentB),
        evidence:count(`SELECT COUNT(*) AS count FROM issue_evidence e JOIN student_issues i ON i.id=e.issue_id WHERE i.student_id=?`,studentB),
        actions:count(`SELECT COUNT(*) AS count FROM issue_practice_actions a JOIN student_issues i ON i.id=a.issue_id WHERE i.student_id=?`,studentB)
      },before);
      const wrongQuote=await api(`/api/students/${studentB}/facts`,{kind:'learning_note',content:'forged fact',sourceConversationId:'conversation-shared',
        sourceMessageId:'message-b',sourceText:'client invented quote'});
      assert.equal(wrongQuote.status,400);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_facts WHERE student_id=? AND content='forged fact'`,studentB),0);
      const noQuote=await api(`/api/students/${studentB}/facts`,{kind:'learning_note',content:'missing quote fact',sourceConversationId:'conversation-shared',sourceMessageId:'message-b'});
      assert.equal(noQuote.status,400);
      // Update the seeded teacher source through the canonical message cache.
      const linkedAt=db.prepare(`SELECT valid_from FROM student_conversation_link_history WHERE conversation_id='conversation-teacher' AND valid_to IS NULL`).get().valid_from;
      rememberMessages('page-test','conversation-teacher',[{id:sourceTeacherMessage,sender:'staff',senderName:'Teacher',text:'Keep your wrist relaxed. Practice slowly.',createdAt:new Date(Date.parse(linkedAt)+500).toISOString()}]);
      const badQuote=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Quote spoof',occurredAt:new Date().toISOString(),sourceKind:'teacher_confirmed',
        conversationId:'conversation-teacher',messageId:sourceTeacherMessage,speaker:'Teacher',verbatimText:'not what the teacher wrote'});
      assert.equal(badQuote.status,400);
      const badSpeaker=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Speaker spoof',occurredAt:new Date().toISOString(),sourceKind:'teacher_confirmed',
        conversationId:'conversation-teacher',messageId:sourceTeacherMessage,speaker:'Learner B',verbatimText:'Keep your wrist relaxed.'});
      assert.equal(badSpeaker.status,400);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_issues WHERE student_id=? AND title IN ('Quote spoof','Speaker spoof')`,studentB),0);
    });

    await t.test('FIX-004: student-reported occurrence cannot create teacher practice instruction',async()=>{
      const result=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Student self-report',occurredAt:new Date().toISOString(),sourceKind:'student_reported',
        conversationId:'conversation-shared',messageId:'message-b',speaker:'Student B',verbatimText:'practiced scales',practiceAction:'Teacher said practice this'});
      assert.equal(result.status,400);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_issues WHERE student_id=? AND title='Student self-report'`,studentB),0);
      assert.equal(count(`SELECT COUNT(*) AS count FROM issue_practice_actions a JOIN student_issues i ON i.id=a.issue_id WHERE i.student_id=?`,studentB),0);
      const noTeacherSource=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Unverified staff confirmation',occurredAt:new Date().toISOString(),
        sourceKind:'staff_confirmed',conversationId:'conversation-shared',messageId:'message-b',speaker:'Student B',
        verbatimText:'I practiced scales',practiceAction:'Staff inferred this prescription'});
      assert.equal(noTeacherSource.status,400);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_issues WHERE student_id=? AND title='Unverified staff confirmation'`,studentB),0);
      const staffKindIsNotTeacher=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Staff kind is not a prescription',occurredAt:new Date().toISOString(),
        sourceKind:'staff_confirmed',conversationId:'conversation-teacher',messageId:sourceTeacherMessage,speaker:'Teacher',
        verbatimText:'Keep your wrist relaxed.',practiceAction:'Do this without teacher confirmation'});
      assert.equal(staffKindIsNotTeacher.status,400);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_issues WHERE student_id=? AND title='Staff kind is not a prescription'`,studentB),0);
      const forgedPrescription=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Forged teacher prescription',occurredAt:new Date().toISOString(),
        sourceKind:'teacher_confirmed',conversationId:'conversation-teacher',messageId:sourceTeacherMessage,speaker:'Teacher',
        verbatimText:'Keep your wrist relaxed.',practiceAction:'Throw the piano into the river.'});
      assert.equal(forgedPrescription.status,400);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_issues WHERE student_id=? AND title='Forged teacher prescription'`,studentB),0);
      assert.equal(count(`SELECT COUNT(*) AS count FROM issue_practice_actions a JOIN student_issues i ON i.id=a.issue_id WHERE i.student_id=?`,studentB),0);

      const reported=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Promotion must reject',occurredAt:new Date().toISOString(),sourceKind:'student_reported',
        conversationId:'conversation-shared',messageId:'message-b',speaker:'Student B',verbatimText:'I practiced scales'});
      assert.equal(reported.status,201,JSON.stringify(reported.data));
      const occurrence=db.prepare(`SELECT o.id,o.revision,o.source_kind AS sourceKind FROM issue_occurrences o JOIN student_issues i ON i.id=o.issue_id
        WHERE i.student_id=? AND i.normalized_title='promotion must reject'`).get(studentB);
      const evidenceCount=count('SELECT COUNT(*) AS count FROM issue_evidence WHERE occurrence_id=?',occurrence.id);
      const promoted=await api(`/api/students/${studentB}/issues/${reported.data.issueId}/occurrences/${occurrence.id}`,
        {revision:occurrence.revision,sourceKind:'teacher_confirmed'});
      assert.equal(promoted.status,400);
      const unchanged=db.prepare(`SELECT source_kind AS sourceKind,revision FROM issue_occurrences WHERE id=?`).get(occurrence.id);
      assert.equal(unchanged.sourceKind,'student_reported');
      assert.equal(unchanged.revision,occurrence.revision);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_evidence WHERE occurrence_id=?',occurrence.id),evidenceCount);
      const sourceLessPatch=await api(`/api/students/${studentB}/issues/${reported.data.issueId}/occurrences/${occurrence.id}`,
        {revision:occurrence.revision,evidenceText:'A quote supplied only by the client'});
      assert.equal(sourceLessPatch.status,400);
      const validTeacherPromotion=await api(`/api/students/${studentB}/issues/${reported.data.issueId}/occurrences/${occurrence.id}`,
        {revision:occurrence.revision,sourceKind:'teacher_confirmed',evidenceReviewSessionId:FIXTURE.reviewSession,
          evidenceText:'Use a relaxed wrist.'});
      assert.equal(validTeacherPromotion.status,200,JSON.stringify(validTeacherPromotion.data));
      const promotedState=db.prepare(`SELECT source_kind AS sourceKind FROM issue_occurrences WHERE id=?`).get(occurrence.id);
      assert.equal(promotedState.sourceKind,'teacher_confirmed');
      const promotedEvidence=db.prepare(`SELECT issue_id AS issueId,review_session_id AS reviewSessionId,verbatim_text AS quote
        FROM issue_evidence WHERE occurrence_id=? AND review_session_id=?`).get(occurrence.id,FIXTURE.reviewSession);
      assert.equal(promotedEvidence.issueId,reported.data.issueId);
      assert.equal(promotedEvidence.reviewSessionId,FIXTURE.reviewSession);
      assert.equal(promotedEvidence.quote,'Use a relaxed wrist.');
    });

    await t.test('FIX-005 / FIX-007 / T04 / T05: duplicate occurrence idempotency and atomic failure',async()=>{
      const missingAssignment=await api(`/api/students/${studentB}/issues/occurrences`,{title:'Must rollback issue',occurredAt:new Date().toISOString(),sourceKind:'teacher_confirmed',
        assignmentId:'does-not-exist',conversationId:'conversation-teacher',messageId:sourceTeacherMessage,speaker:'Teacher',verbatimText:'Keep your wrist relaxed.'});
      assert.equal(missingAssignment.status,404,JSON.stringify(missingAssignment.data));
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_issues WHERE student_id=? AND normalized_title='must rollback issue'`,studentB),0);
      const input={title:'Wrist position',summary:'Relax the wrist',occurredAt:new Date().toISOString(),sourceKind:'teacher_confirmed',
        conversationId:'conversation-teacher',messageId:sourceTeacherMessage,speaker:'Teacher',verbatimText:'Keep your wrist relaxed.',practiceAction:'Practice slowly',sourceKey:'untrusted-key-one'};
      const first=await api(`/api/students/${studentB}/issues/occurrences`,input);
      assert.equal(first.status,201,JSON.stringify(first.data));
      const second=await api(`/api/students/${studentB}/issues/occurrences`,{...input,sourceKey:'untrusted-key-two'});
      assert.equal(second.status,201);
      const issue=db.prepare(`SELECT id FROM student_issues WHERE student_id=? AND normalized_title='wrist position'`).get(studentB);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_occurrences WHERE issue_id=?',issue.id),1);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_evidence WHERE issue_id=?',issue.id),1);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_practice_actions WHERE issue_id=?',issue.id),1);
      const extraMessageAt=new Date(Date.now()+1000).toISOString();
      rememberMessages('page-test','conversation-teacher',[{id:'message-teacher-extra',sender:'staff',senderName:'Teacher',
        text:'Practice the phrase slowly.',createdAt:extraMessageAt}]);
      const originalOccurrence=db.prepare(`SELECT id,revision FROM issue_occurrences WHERE issue_id=?`).get(issue.id);
      const attached=await api(`/api/students/${studentB}/issues/${issue.id}/occurrences/${originalOccurrence.id}`,
        {revision:originalOccurrence.revision,evidenceConversationId:'conversation-teacher',evidenceMessageId:'message-teacher-extra',
          evidenceText:'Practice the phrase slowly.'});
      assert.equal(attached.status,200,JSON.stringify(attached.data));
      assert.equal(count(`SELECT COUNT(*) AS count FROM issue_evidence WHERE occurrence_id=? AND issue_id=?`,originalOccurrence.id,issue.id),2);
      assert.equal(count(`SELECT COUNT(*) AS count FROM issue_evidence WHERE occurrence_id=? AND issue_id IS NULL`,originalOccurrence.id),0);
      await api(`/api/students/${studentB}/issues/occurrences`,{...input,sourceKey:'untrusted-key-one'});
      await api(`/api/students/${studentB}/issues/occurrences`,{...input,sourceKey:'untrusted-key-two'});
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_occurrences WHERE issue_id=?',issue.id),1);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_evidence WHERE issue_id=?',issue.id),2);

      rememberMessages('page-test','conversation-teacher',[{id:'message-teacher-distinct',sender:'staff',senderName:'Teacher',
        text:'Now play the next phrase without pausing. Practice the next phrase slowly.',createdAt:new Date(Date.now()+2000).toISOString()}]);
      const distinctPractice=await api(`/api/students/${studentB}/issues/occurrences`,{issueId:issue.id,occurredAt:new Date().toISOString(),
        sourceKind:'teacher_confirmed',conversationId:'conversation-teacher',messageId:'message-teacher-distinct',speaker:'Teacher',
        verbatimText:'Now play the next phrase without pausing.',practiceAction:'Practice the next phrase slowly.',sourceKey:'untrusted-key-one'});
      assert.equal(distinctPractice.status,201,JSON.stringify(distinctPractice.data));
      const distinctId=distinctPractice.data.occurrenceId;
      assert.notEqual(distinctId,originalOccurrence.id);
      const distinctRetry=await api(`/api/students/${studentB}/issues/occurrences`,{issueId:issue.id,occurredAt:new Date().toISOString(),
        sourceKind:'teacher_confirmed',conversationId:'conversation-teacher',messageId:'message-teacher-distinct',speaker:'Teacher',
        verbatimText:'Now play the next phrase without pausing.',practiceAction:'Practice the next phrase slowly.',sourceKey:'different-client-key'});
      assert.equal(distinctRetry.data.occurrenceId,distinctId);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_occurrences WHERE issue_id=?',issue.id),2);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_practice_actions WHERE issue_id=?',issue.id),2);
      const sameTakeAt=new Date(Date.now()+10_000).toISOString();
      const laterTakeAt=new Date(Date.now()+86_400_000).toISOString();
      rememberMessages('page-test','conversation-teacher',[
        {id:'same-take-source-1',sender:'staff',senderName:'Teacher',text:'Wrist is tense in this take.',createdAt:sameTakeAt},
        {id:'same-take-source-2',sender:'staff',senderName:'Teacher',text:'More detail on this same take.',createdAt:new Date(Date.parse(sameTakeAt)+5000).toISOString()},
        {id:'later-take-source',sender:'staff',senderName:'Teacher',text:'A new take has wrist tension.',createdAt:laterTakeAt}
      ]);
      const sameTakeBody={title:'Same take grouping',occurredAt:sameTakeAt,sourceKind:'teacher_confirmed',
        conversationId:'conversation-teacher',speaker:'Teacher',sourceKey:'same-practice-key'};
      const takeOne=await api(`/api/students/${studentB}/issues/occurrences`,{...sameTakeBody,
        messageId:'same-take-source-1',verbatimText:'Wrist is tense in this take.'});
      const takeOneMore=await api(`/api/students/${studentB}/issues/occurrences`,{...sameTakeBody,
        issueId:takeOne.data.issueId,messageId:'same-take-source-2',verbatimText:'More detail on this same take.'});
      assert.equal(takeOne.status,201,JSON.stringify(takeOne.data));
      assert.equal(takeOneMore.status,201,JSON.stringify(takeOneMore.data));
      assert.equal(takeOneMore.data.occurrenceId,takeOne.data.occurrenceId);
      const groupedEvidence=db.prepare(`SELECT issue_id AS issueId,occurrence_id AS occurrenceId FROM issue_evidence WHERE occurrence_id=?`).all(takeOne.data.occurrenceId);
      assert.equal(groupedEvidence.length,2);
      assert.equal(groupedEvidence.every((row)=>row.issueId===takeOne.data.issueId&&row.occurrenceId===takeOne.data.occurrenceId),true);
      const laterTake=await api(`/api/students/${studentB}/issues/occurrences`,{...sameTakeBody,
        issueId:takeOne.data.issueId,occurredAt:laterTakeAt,messageId:'later-take-source',verbatimText:'A new take has wrist tension.'});
      assert.equal(laterTake.status,201,JSON.stringify(laterTake.data));
      assert.notEqual(laterTake.data.occurrenceId,takeOne.data.occurrenceId);
      assert.equal(count('SELECT COUNT(*) AS count FROM issue_occurrences WHERE issue_id=?',takeOne.data.issueId),2);
      const concurrentOccurrence=await Promise.all([1,2].map(()=>runServiceProcess({type:'occurrence',input:{pageId:'page-test',studentId:studentB,staffId:'staff-test',
        title:'Concurrent occurrence',summary:'Same grading occasion',occurredAt:new Date().toISOString(),sourceKind:'teacher_confirmed',conversationId:'conversation-teacher',
        messageId:sourceTeacherMessage,speaker:'Teacher',verbatimText:'Keep your wrist relaxed.',sourceKey:`different-key-${Math.random()}`}})));
      assert.equal(concurrentOccurrence[0].occurrenceId,concurrentOccurrence[1].occurrenceId);
      assert.equal(count(`SELECT COUNT(*) AS count FROM issue_occurrences o JOIN student_issues i ON i.id=o.issue_id WHERE i.student_id=? AND i.normalized_title='concurrent occurrence'`,studentB),1);
      const reviewBody={conversationId:'conversation-shared',sourceMessageId:'message-b',clientKey:'one-review-only',teacherInput:'Work on scales',assignmentTitle:'Major scales'};
      const repeated=await Promise.all([
        api(`/api/students/${studentB}/review-sessions`,reviewBody),api(`/api/students/${studentB}/review-sessions`,reviewBody)
      ]);
      assert.equal(repeated[0].status,201);assert.equal(repeated[1].status,201);
      assert.equal(repeated[0].data.id,repeated[1].data.id);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND client_key='one-review-only'`,studentB),1);
      const crossProcessPayload={type:'review',input:{pageId:'page-test',studentId:studentB,conversationId:'conversation-shared',sourceMessageId:'message-b',
        clientKey:'cross-process-review',teacherInput:'Cross-process review',staffId:'staff-test'}};
      const concurrentReviews=await Promise.all([runServiceProcess(crossProcessPayload),runServiceProcess(crossProcessPayload)]);
      assert.equal(concurrentReviews[0].id,concurrentReviews[1].id);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND client_key='cross-process-review'`,studentB),1);
      const conflictingRetry=await api(`/api/students/${studentB}/review-sessions`,{...reviewBody,teacherInput:'Different review'});
      assert.equal(conflictingRetry.status,409);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND client_key='one-review-only'`,studentB),1);
    });

    await t.test('FIX-006 / T04: conflicting confirmed preferences remain pending until staff decision',async()=>{
      const before=createFact({pageId:'page-test',studentId:studentB,staffId:'staff-test',kind:'preference',content:'Gọi là Lan'});
      const after=createFact({pageId:'page-test',studentId:studentB,staffId:'staff-test',kind:'preference',content:'Gọi là Mai'});
      let group=db.prepare(`SELECT id,content,conflict_status AS conflictStatus,status,use_in_suggestions AS useInSuggestions FROM student_facts
        WHERE student_id=? AND conflict_key='preferred_name' ORDER BY created_at,id`).all(studentB);
      assert.equal(group.length,2);
      assert.deepEqual(group.map((fact)=>fact.conflictStatus),['pending','pending']);
      assert.equal(group.some((fact)=>fact.status==='archived'),false);
      assert.equal(group.every((fact)=>fact.useInSuggestions===0),true);
      const newest=group.find((fact)=>fact.content==='Gọi là Mai');
      const resolved=await api(`/api/students/${studentB}/facts/${newest.id}`,{conflictResolution:'keep_current'});
      assert.equal(resolved.status,200);
      group=db.prepare(`SELECT id,content,conflict_status AS conflictStatus,status,use_in_suggestions AS useInSuggestions FROM student_facts
        WHERE student_id=? AND conflict_key='preferred_name' ORDER BY created_at,id`).all(studentB);
      assert.equal(group.find((fact)=>fact.content==='Gọi là Lan').status,'active');
      assert.equal(group.find((fact)=>fact.content==='Gọi là Mai').status,'archived');
      assert.equal(group.every((fact)=>fact.conflictStatus==='resolved'),true);
      assert.equal(group.filter((fact)=>fact.status==='active').every((fact)=>fact.useInSuggestions===1),true);
      assert.equal(before.some((fact)=>fact.content==='Gọi là Lan'),true);
      assert.equal(after.some((fact)=>fact.content==='Gọi là Mai'),true);
    });

    await t.test('FIX-009: CREATE and UPDATE share conflict resolution, including AI context',async()=>{
      addConversation('conflict-resolution-conversation','conflict-customer');
      const identity=linkConversation({pageId:FIXTURE.pageId,conversationId:'conflict-resolution-conversation',newStudentName:'Conflict QA',staffId:FIXTURE.staffId});
      const conflictStudent=identity.student.id;
      const linkedAt=db.prepare(`SELECT valid_from FROM student_conversation_link_history WHERE conversation_id='conflict-resolution-conversation' AND valid_to IS NULL`).get().valid_from;
      rememberMessages(FIXTURE.pageId,'conflict-resolution-conversation',[{id:'conflict-student-message',sender:'student',senderName:'Conflict QA',
        text:'I practiced piano today.',createdAt:new Date(Date.parse(linkedAt)+1000).toISOString()}]);
      const duplicateA=createFact({pageId:FIXTURE.pageId,studentId:conflictStudent,staffId:FIXTURE.staffId,kind:'preference',content:'Gọi là Huy'});
      const duplicateB=createFact({pageId:FIXTURE.pageId,studentId:conflictStudent,staffId:FIXTURE.staffId,kind:'preference',content:'Gọi là Huy'});
      const idA=duplicateA.find((fact)=>fact.content==='Gọi là Huy').id;
      const idB=duplicateB.find((fact)=>fact.content==='Gọi là Huy'&&fact.id!==idA).id;
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_facts WHERE student_id=? AND conflict_key='preferred_name' AND conflict_status='none' AND use_in_suggestions=1`,conflictStudent),2);

      const updatedIntoConflict=await api(`/api/students/${conflictStudent}/facts/${idB}`,{content:'Gọi là Lan'});
      assert.equal(updatedIntoConflict.status,200);
      let group=db.prepare(`SELECT content,conflict_status AS conflictStatus,use_in_suggestions AS useInSuggestions FROM student_facts
        WHERE student_id=? AND conflict_key='preferred_name' AND status='active'`).all(conflictStudent);
      assert.deepEqual(new Set(group.map((fact)=>fact.conflictStatus)),new Set(['pending']));
      assert.equal(group.every((fact)=>fact.useInSuggestions===0),true);

      const updatedOutOfConflict=await api(`/api/students/${conflictStudent}/facts/${idB}`,{content:'Gọi là Huy'});
      assert.equal(updatedOutOfConflict.status,200);
      group=db.prepare(`SELECT content,conflict_status AS conflictStatus,use_in_suggestions AS useInSuggestions FROM student_facts
        WHERE student_id=? AND conflict_key='preferred_name' AND status='active'`).all(conflictStudent);
      assert.equal(group.every((fact)=>fact.conflictStatus==='none'&&fact.useInSuggestions===1),true);
      const changedType=await api(`/api/students/${conflictStudent}/facts/${idB}`,{kind:'learning_note'});
      assert.equal(changedType.status,200);
      const detached=db.prepare('SELECT kind,conflict_key AS conflictKey,status,use_in_suggestions AS useInSuggestions FROM student_facts WHERE id=?').get(idB);
      assert.equal(detached.kind,'learning_note');
      assert.equal(detached.conflictKey,null);
      assert.equal(detached.status,'active');
      assert.equal(detached.useInSuggestions,1);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_facts WHERE student_id=? AND conflict_key='preferred_name' AND status='active' AND conflict_status='none' AND use_in_suggestions=1`,conflictStudent),1);
      assert.equal((await api(`/api/students/${conflictStudent}/facts/${idB}`,{kind:'preference'})).status,200);
      const archived=await api(`/api/students/${conflictStudent}/facts/${idB}`,{status:'archived'});
      assert.equal(archived.status,200);
      const newConflict=await api(`/api/students/${conflictStudent}/facts`,{kind:'preference',content:'Gọi là Mai'});
      assert.equal(newConflict.status,201);
      group=db.prepare(`SELECT id,content,conflict_status AS conflictStatus,status,use_in_suggestions AS useInSuggestions FROM student_facts
        WHERE student_id=? AND conflict_key='preferred_name'`).all(conflictStudent);
      assert.equal(group.filter((fact)=>fact.status==='active').length,2);
      assert.equal(group.filter((fact)=>fact.status==='active').every((fact)=>fact.conflictStatus==='pending'&&fact.useInSuggestions===0),true);
      const mai=group.find((fact)=>fact.content==='Gọi là Mai');
      const resolution=await api(`/api/students/${conflictStudent}/facts/${mai.id}`,{conflictResolution:'keep_current'});
      assert.equal(resolution.status,200);
      const resolved=db.prepare(`SELECT id,content,status,conflict_status AS conflictStatus,use_in_suggestions AS useInSuggestions FROM student_facts
        WHERE student_id=? AND conflict_key='preferred_name'`).all(conflictStudent);
      const usable=resolved.filter((fact)=>fact.status==='active'&&fact.useInSuggestions===1);
      assert.equal(usable.length,1);
      assert.equal(usable[0].content,'Gọi là Huy');

      const originalFetch=globalThis.fetch;const captures=[];
      globalThis.fetch=async(url,options)=>{
        if(String(url).startsWith('https://capture.invalid/')) {
          captures.push(JSON.parse(options.body));
          const result={intent:'assignment_feedback',sensitivity:'xanh',flag_reason:'QA',analysis:'QA',
            replies:[{tone:'Warm',content:'Good.'},{tone:'Clear',content:'Practice.'},{tone:'Encourage',content:'Great.'}]};
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(url,options);
      };
      try {
        const suggestion=await api('/api/suggestions',{conversationId:'conflict-resolution-conversation',studentId:conflictStudent,mode:'chat',
          messages:[{id:'conflict-student-message',sender:'student',text:'untrusted copy'}],provider:'openai',baseUrl:'https://capture.invalid/v1',apiKey:'qa-key',model:'gpt-4o'});
        assert.equal(suggestion.status,200,JSON.stringify(suggestion.data));
        const prompt=captures[0].messages.map((message)=>message.content).join('\n');
        assert.equal(prompt.includes('Gọi là Huy'),true);
        assert.equal(prompt.includes('Gọi là Mai'),false);
        assert.deepEqual(suggestion.data.usedFacts.filter((fact)=>fact.kind==='preference').map((fact)=>fact.id),[usable[0].id]);
        const generation=db.prepare(`SELECT context_json AS context FROM generations WHERE conversation_id='conflict-resolution-conversation' ORDER BY created_at DESC LIMIT 1`).get();
        assert.deepEqual(JSON.parse(generation.context).usedFactIds,suggestion.data.usedFacts.map((fact)=>fact.id));
      } finally { globalThis.fetch=originalFetch; }
      const extraConflict=await api(`/api/students/${conflictStudent}/facts`,{kind:'preference',content:'Gọi là Tuấn'});
      assert.equal(extraConflict.status,201);
      const concurrentFacts=db.prepare(`SELECT id FROM student_facts WHERE student_id=? AND conflict_key='preferred_name' AND status='active'`).all(conflictStudent);
      assert.equal(concurrentFacts.length,2);
      const concurrentUpdates=await Promise.all(concurrentFacts.map((fact,index)=>api(`/api/students/${conflictStudent}/facts/${fact.id}`,
        {content:index===0?'Gọi là Lan':'Gọi là Nga'})));
      assert.equal(concurrentUpdates.every((response)=>response.status===200),true);
      const concurrentState=db.prepare(`SELECT conflict_status AS conflictStatus,use_in_suggestions AS useInSuggestions FROM student_facts
        WHERE student_id=? AND conflict_key='preferred_name' AND status='active'`).all(conflictStudent);
      assert.equal(concurrentState.length,2);
      assert.equal(concurrentState.every((fact)=>fact.conflictStatus==='pending'&&fact.useInSuggestions===0),true);
      assert.equal((await api(`/api/students/${conflictStudent}/facts`,{kind:'preference',content:'Call me Alice'})).status,201);
      assert.equal((await api(`/api/students/${conflictStudent}/facts`,{kind:'preference',content:'Call me Alice'})).status,201);
      const english=db.prepare(`SELECT id FROM student_facts WHERE student_id=? AND content='Call me Alice' ORDER BY rowid`).all(conflictStudent);
      assert.equal(english.length,2);
      assert.equal((await api(`/api/students/${conflictStudent}/facts/${english[1].id}`,{content:'Call me Bob'})).status,200);
      const englishState=db.prepare(`SELECT id,content,conflict_key AS conflictKey,conflict_status AS conflictStatus,
        use_in_suggestions AS usable FROM student_facts WHERE id IN (?,?)`).all(english[0].id,english[1].id);
      assert.equal(englishState.every((fact)=>fact.conflictKey==='preferred_name'&&fact.conflictStatus==='pending'&&fact.usable===0),true);
      const englishCaptures=[];
      globalThis.fetch=async(url,options)=>{
        if(String(url).startsWith('https://capture.invalid/')) {
          englishCaptures.push(JSON.parse(options.body));
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:'chat',analysis:'QA',
            replies:[{tone:'Warm',content:'Good.'},{tone:'Clear',content:'Practice.'},{tone:'Encourage',content:'Great.'}]})}}]}),
            {status:200,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(url,options);
      };
      try {
        const afterEnglish=await api('/api/suggestions',{conversationId:'conflict-resolution-conversation',studentId:conflictStudent,mode:'chat',
          messages:[{id:'conflict-student-message',sender:'student',text:'untrusted copy'}],provider:'openai',baseUrl:'https://capture.invalid/v1',apiKey:'qa-key',model:'gpt-4o'});
        assert.equal(afterEnglish.status,200,JSON.stringify(afterEnglish.data));
        const capturedAfterEnglish=JSON.stringify(englishCaptures.at(-1));
        assert.equal(capturedAfterEnglish.includes('Call me Alice')||capturedAfterEnglish.includes('Call me Bob'),false);
        assert.equal(afterEnglish.data.usedFacts.some((fact)=>english.some((row)=>row.id===fact.id)),false);
        const englishAudit=db.prepare(`SELECT context_json AS context FROM generations WHERE conversation_id='conflict-resolution-conversation' ORDER BY rowid DESC LIMIT 1`).get();
        assert.equal(JSON.parse(englishAudit.context).usedFactIds.some((id)=>english.some((row)=>row.id===id)),false);
      } finally { globalThis.fetch=originalFetch; }
    });

    await t.test('FIX-010 / T07: legacy context migration is rerunnable and legacy PATCH invalidates summary revision',async()=>{
      addConversation('legacy-conversation','legacy-contact');
      const legacyRow={page_id:'page-test',student_id:'legacy-contact',student_name:'Old learner',
        profile_json:JSON.stringify({recipientCall:'Bé Lan',senderCall:'Cô',nextAction:'Ôn gam Đô',specialNotes:'Private legacy note',studyNotes:'Old study note'}),
        memories_json:JSON.stringify([{id:'oldmem',content:'Practiced slowly',status:'active'}]),custom_fields_json:'[]',revision:3,
        created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      db.prepare(`INSERT INTO student_contexts(page_id,student_id,student_name,profile_json,memories_json,custom_fields_json,revision,created_at,updated_at)
        VALUES (@page_id,@student_id,@student_name,@profile_json,@memories_json,@custom_fields_json,@revision,@created_at,@updated_at)`).run(legacyRow);
      const identity=linkConversation({pageId:'page-test',conversationId:'legacy-conversation',newStudentName:'Legacy learner',staffId:'staff-test',importLegacyContext:true});
      const migratedId=identity.student.id;
      const factsBefore=count('SELECT COUNT(*) AS count FROM student_facts WHERE student_id=? AND verification_status=\'legacy_unverified\'',migratedId);
      assert.ok(factsBefore>=4);
      linkConversation({pageId:'page-test',conversationId:'legacy-conversation',studentId:migratedId,staffId:'staff-test',importLegacyContext:true});
      assert.equal(count('SELECT COUNT(*) AS count FROM student_facts WHERE student_id=? AND verification_status=\'legacy_unverified\'',migratedId),factsBefore);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_contexts WHERE page_id='page-test' AND student_id='legacy-contact'`),1);
      const initial=getStudentSummary('page-test',migratedId);
      const initialRevision=initial.revision;
      const context=getStudentContext('page-test',migratedId,'Legacy learner');
      updateStudentContext('page-test',migratedId,'Legacy learner',context.revision,(current)=>({
        ...current,profile:{...current.profile,studyNotes:'Updated legacy profile'}
      }));
      const currentStudent=db.prepare('SELECT revision FROM students WHERE id=?').get(migratedId).revision;
      assert.ok(currentStudent>initialRevision);
      const refreshed=getStudentSummary('page-test',migratedId);
      assert.equal(refreshed.profile.studyNotes,'Updated legacy profile');
      assert.ok(refreshed.revision>initialRevision);
    });

    await t.test('FIX-011 / T09: assignment start needs evidence and coverage controls the at-least label',async()=>{
      assert.throws(()=>createAssignment({pageId:'page-test',studentId:studentB,title:'Evidence required',startedAt:'2026-09-20T00:00:00.000Z'}),{code:'ASSIGNMENT_START_EVIDENCE_REQUIRED'});
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_assignments WHERE student_id=? AND title='Evidence required'`,studentB),0);
      const created=createAssignment({pageId:'page-test',studentId:studentB,title:'Scale pattern',startedAt:'2026-09-20T16:00:00.000Z',startedSource:'Teacher message message-b'});
      let assignment=created.items.find((row)=>row.title==='Scale pattern');
      assert.ok(assignment.durationLabel.startsWith('ít nhất '));
      rememberMessages('page-test','conversation-shared',[],{complete:true,historyProgress:true});
      rememberMessages('page-test','conversation-teacher',[],{complete:true,historyProgress:true});
      rememberMessages('page-test','boundary-conversation',[],{complete:true,historyProgress:true});
      rememberMessages('page-test','identity-relink-conversation',[],{complete:true,historyProgress:true});
      assignment=listAssignments('page-test',studentB).find((row)=>row.id===assignment.id);
      assert.equal(assignment.durationLabel.startsWith('ít nhất '),false);
      assert.ok(assignment.daysStuck>=0);
      const noEvidencePatch=await api(`/api/students/${studentB}/assignments/${assignment.id}`,{startedAt:'2026-09-21T00:00:00.000Z',startedSource:null,revision:assignment.revision});
      assert.equal(noEvidencePatch.status,400);
      const unchanged=db.prepare('SELECT started_at AS startedAt,started_source AS source FROM student_assignments WHERE id=?').get(assignment.id);
      assert.equal(unchanged.startedAt,'2026-09-20T16:00:00.000Z');
      assert.equal(unchanged.source,'Teacher message message-b');
      const legacyId='legacy-start-without-proof';
      db.prepare(`INSERT INTO student_assignments(id,student_id,title,normalized_title,started_at,started_source,status,created_at,updated_at)
        VALUES (?,?,?,'legacy start without proof','2026-09-19T00:00:00.000Z',NULL,'active',?,?)`)
        .run(legacyId,studentB,'Legacy start',new Date().toISOString(),new Date().toISOString());
      let legacyStart=listAssignments('page-test',studentB).find((row)=>row.id===legacyId);
      assert.equal(legacyStart.startedAt,null);
      assert.equal(legacyStart.unverifiedStartedAt,'2026-09-19T00:00:00.000Z');
      assert.equal(legacyStart.startedEvidenceStatus,'missing');
      assert.equal(legacyStart.durationLabel,'chưa rõ');
      const titleUpdate=await api(`/api/students/${studentB}/assignments/${legacyId}`,{title:'Legacy title updated',revision:legacyStart.revision});
      assert.equal(titleUpdate.status,200,JSON.stringify(titleUpdate.data));
    });

    await t.test('FIX-008 / T08: backend backup and restore include feature schema and consistent data',async()=>{
      const backup=path.join(tempDir,'backend-backup.sqlite');
      const restored=path.join(tempDir,'restored.sqlite');
      execFileSync(process.execPath,[path.join(backendDir,'scripts/backup.mjs'),backup],{env:process.env,stdio:'pipe'});
      execFileSync(process.execPath,[path.join(backendDir,'scripts/restore.mjs'),backup,restored],{env:process.env,stdio:'pipe'});
      const copy=new DatabaseSync(restored);
      try {
        assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
        assert.equal(copy.prepare('PRAGMA foreign_key_check').all().length,0);
        for(const table of ['student_facts','student_conversation_link_history','conversation_backfill_jobs','issue_evidence'])
          assert.ok(copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
        assert.equal(copy.prepare('SELECT COUNT(*) AS count FROM student_facts').get().count,db.prepare('SELECT COUNT(*) AS count FROM student_facts').get().count);
      } finally { copy.close(); }
      assert.throws(()=>execFileSync(process.execPath,[path.join(backendDir,'scripts/restore.mjs'),backup,restored],{env:process.env,stdio:'pipe'}));
    });

    await t.test('FIX-013 / REGRESSION-001: Pancake backfill paging, retries, duplicates, live arrivals, and ambiguous cursors',async()=>{
      const main='backfill-conversation';
      const midError='backfill-mid-error';
      const ambiguous='backfill-ambiguous';
      const absentCursor='backfill-absent-cursor';
      const nullOnly='backfill-null-only';
      const conflictingTerminal='backfill-conflicting-terminal';
      const routeAbsentCursor='backfill-route-absent-cursor';
      const routeContradictory='backfill-route-contradictory';
      const liveRoute='backfill-live-route';
      for(const conversationId of [main,midError,ambiguous,absentCursor,nullOnly,conflictingTerminal,routeAbsentCursor,routeContradictory,liveRoute]) {
        addConversation(conversationId);
        enqueueHistoryBackfill(FIXTURE.pageId,conversationId);
      }
      db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,oldest_cursor,complete)
        VALUES (?,?,?,0)`).run(FIXTURE.pageId,absentCursor,'last-confirmed-cursor');
      db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,oldest_cursor,complete)
        VALUES (?,?,?,0)`).run(FIXTURE.pageId,routeAbsentCursor,'route-confirmed-cursor');
      db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,oldest_cursor,complete)
        VALUES (?,?,?,0)`).run(FIXTURE.pageId,nullOnly,'null-only-confirmed-cursor');
      db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,oldest_cursor,complete)
        VALUES (?,?,?,0)`).run(FIXTURE.pageId,conflictingTerminal,'conflicting-confirmed-cursor');
      db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,oldest_cursor,complete)
        VALUES (?,?,?,0)`).run(FIXTURE.pageId,routeContradictory,'route-conflicting-cursor');
      db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,oldest_cursor,complete)
        VALUES (?,?,?,0)`).run(FIXTURE.pageId,liveRoute,'route-live-history-cursor');
      const calls=[];
      const scripted=new Map([
        [main,[
          {body:{messages:[{id:'bf-old',sender_type:'page',text:'old body',created_at:'2026-09-01T00:00:00.000Z'}],has_more:true,next_before:'cursor-old'}},
          {before:'cursor-old',body:{messages:[{id:'bf-old',sender_type:'user',sender_name:'Edited vendor sender',text:'edited old body',created_at:'2026-08-30T00:00:00.000Z'},
            {id:'bf-new',sender_type:'page',text:'new history body',created_at:'2026-09-02T00:00:00.000Z'}],has_more:false,next_before:null},
            during:()=>rememberMessages(FIXTURE.pageId,main,[{id:'live-during-backfill',sender:'student',text:'new live message',createdAt:'2026-09-24T12:00:00.000Z'}])}
        ]],
        [midError,[
          {body:{messages:[{id:'mid-old',sender_type:'page',text:'mid old',created_at:'2026-09-03T00:00:00.000Z'}],has_more:true,next_before:'retry-cursor'}},
          {before:'retry-cursor',status:503,body:{error:'temporary fake Pancake failure'}},
          {before:'retry-cursor',body:{messages:[{id:'mid-new',sender_type:'page',text:'mid new',created_at:'2026-09-04T00:00:00.000Z'}],has_more:false,next_before:null}}
        ]],
        [ambiguous,[
          {body:{messages:[{id:'ambiguous-old',sender_type:'page',text:'saved but cursor ambiguous',created_at:'2026-09-05T00:00:00.000Z'}],
            has_more:true,next_before:null,pagination:{has_more:true,next_before:'contradictory-nested-cursor'}}}
        ]],
        [absentCursor,[
          {before:'last-confirmed-cursor',body:{messages:[{id:'absent-cursor-old',sender_type:'page',text:'saved without a cursor',created_at:'2026-09-06T00:00:00.000Z'}],has_more:true}}
        ]],
        [nullOnly,[
          {before:'null-only-confirmed-cursor',body:{messages:[{id:'null-only-old',sender_type:'page',text:'terminal not confirmed',created_at:'2026-09-06T01:00:00.000Z'}],next_before:null}}
        ]],
        [conflictingTerminal,[
          {before:'conflicting-confirmed-cursor',body:{messages:[{id:'conflicting-terminal-old',sender_type:'page',text:'terminal with next page',created_at:'2026-09-06T02:00:00.000Z'}],has_more:false,next_before:'still-more-history'}}
        ]],
        [routeAbsentCursor,[
          {before:'route-confirmed-cursor',body:{messages:[{id:'route-absent-cursor-old',sender_type:'page',text:'route sync missing cursor',
            created_at:'2026-09-07T00:00:00.000Z'}],has_more:true}}
        ]],
        [routeContradictory,[
          {before:'route-conflicting-cursor',body:{messages:[{id:'route-conflicting-old',sender_type:'page',text:'route terminal with next cursor',
            created_at:'2026-09-07T01:00:00.000Z'}],has_more:false,next_before:'still-more-route-history'}}
        ]],
        [liveRoute,[
          {body:{messages:[{id:'route-live-message',sender_type:'user',text:'new live message from messages route',
            created_at:'2026-09-24T15:00:00.000Z'}],has_more:true,next_before:'must-not-replace-history-cursor'}}
        ]]
      ]);
      const originalFetch=globalThis.fetch;
      globalThis.fetch=async(url,options)=>{
        const parsed=new URL(String(url));
        if(parsed.hostname!=='pages.fm') return originalFetch(url,options);
        assert.equal(parsed.searchParams.get('page_access_token'),'fake-pancake-token-for-tests-only');
        const conversationId=parsed.pathname.match(/\/conversations\/([^/]+)\/messages$/)?.[1];
        const responseScript=scripted.get(conversationId)?.shift();
        assert.ok(responseScript,`unexpected mock Pancake request for ${parsed.pathname}`);
        const before=parsed.searchParams.get('before')||undefined;
        calls.push({conversationId,before});
        assert.equal(before,responseScript.before);
        responseScript.during?.();
        return new Response(JSON.stringify(responseScript.body),{status:responseScript.status||200,
          headers:{'Content-Type':'application/json'}});
      };
      try {
        const first=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:main});
        assert.equal(first.status,'queued');
        const cursorAfterBackfillPage=db.prepare(`SELECT oldest_cursor AS cursor,complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
          .get(FIXTURE.pageId,main);
        assert.equal(cursorAfterBackfillPage.cursor,'cursor-old');
        rememberMessages(FIXTURE.pageId,main,[{id:'live-between-backfill-pages',sender:'student',text:'A live message while history remains',
          createdAt:'2026-09-24T11:00:00.000Z'}]);
        rememberMessages(FIXTURE.pageId,main,[{id:'live-between-backfill-pages-2',sender:'student',text:'Another live message',
          createdAt:'2026-09-24T11:30:00.000Z'}]);
        const cursorAfterLive=db.prepare(`SELECT oldest_cursor AS cursor,complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
          .get(FIXTURE.pageId,main);
        assert.equal(cursorAfterLive.cursor,'cursor-old');
        assert.equal(cursorAfterLive.complete,0);
        const second=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:main});
        assert.equal(second.status,'complete');
        assert.deepEqual(calls.slice(0,2),[{conversationId:main,before:undefined},{conversationId:main,before:'cursor-old'}]);
        assert.equal(count('SELECT COUNT(*) AS count FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?',
          FIXTURE.pageId,main,'bf-old'),1);
        const duplicate=db.prepare(`SELECT sender,text,created_at AS createdAt FROM conversation_message_cache
          WHERE page_id=? AND conversation_id=? AND message_id='bf-old'`).get(FIXTURE.pageId,main);
        assert.equal(duplicate.sender,'staff');
        assert.equal(duplicate.text,'edited old body');
        assert.equal(duplicate.createdAt,'2026-09-01T00:00:00.000Z');
        assert.equal(count('SELECT COUNT(*) AS count FROM conversation_message_cache WHERE page_id=? AND conversation_id=?',FIXTURE.pageId,main),5);
        assert.equal(count(`SELECT COUNT(*) AS count FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id IN
          ('live-between-backfill-pages','live-between-backfill-pages-2','live-during-backfill')`,FIXTURE.pageId,main),3);
        const mainCoverage=db.prepare(`SELECT oldest_cursor AS cursor,newest_message_at AS newest,oldest_message_at AS oldest,complete
          FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`).get(FIXTURE.pageId,main);
        assert.equal(mainCoverage.complete,1);
        assert.equal(mainCoverage.newest,'2026-09-24T12:00:00.000Z');
        assert.equal(mainCoverage.oldest,'2026-09-01T00:00:00.000Z');
        const callCount=calls.length;
        const afterDone=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:main});
        assert.equal(afterDone.status,'complete');
        assert.equal(calls.length,callCount);

        const beforeRetry=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:midError});
        assert.equal(beforeRetry.status,'queued');
        const failedPage=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:midError});
        assert.equal(failedPage.status,'queued');
        assert.equal(failedPage.attempts,1);
        assert.equal(db.prepare(`SELECT oldest_cursor AS cursor,complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
          .get(FIXTURE.pageId,midError).cursor,'retry-cursor');
        const retry=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:midError});
        assert.equal(retry.status,'complete');
        assert.deepEqual(calls.filter((call)=>call.conversationId===midError).map((call)=>call.before),
          [undefined,'retry-cursor','retry-cursor']);

        const blocked=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:ambiguous});
        assert.equal(blocked.status,'blocked');
        const ambiguousState=db.prepare(`SELECT oldest_cursor AS cursor,complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
          .get(FIXTURE.pageId,ambiguous);
        assert.equal(ambiguousState.complete,0);
        assert.equal(ambiguousState.cursor,null);
        assert.equal(count('SELECT COUNT(*) AS count FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?',
          FIXTURE.pageId,ambiguous,'ambiguous-old'),1);
        const absent=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId:absentCursor});
        assert.equal(absent.status,'blocked');
        const absentState=db.prepare(`SELECT oldest_cursor AS cursor,complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
          .get(FIXTURE.pageId,absentCursor);
        assert.equal(absentState.cursor,'last-confirmed-cursor');
        assert.equal(absentState.complete,0);
        assert.equal(calls.filter((call)=>call.conversationId===absentCursor)[0].before,'last-confirmed-cursor');
        assert.equal(count('SELECT COUNT(*) AS count FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?',
          FIXTURE.pageId,absentCursor,'absent-cursor-old'),1);
        for(const [conversationId,confirmedCursor] of [
          [nullOnly,'null-only-confirmed-cursor'],[conflictingTerminal,'conflicting-confirmed-cursor']
        ]) {
          const result=await processHistoryBackfillPage({pageId:FIXTURE.pageId,conversationId});
          assert.equal(result.status,'blocked',JSON.stringify(result));
          const coverage=db.prepare(`SELECT oldest_cursor AS cursor,complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
            .get(FIXTURE.pageId,conversationId);
          assert.equal(coverage.cursor,confirmedCursor);
          assert.equal(coverage.complete,0);
        }
        const routeSync=await api(`/api/conversations/${routeAbsentCursor}/history/sync`,{pageId:FIXTURE.pageId,pages:1,limit:5});
        assert.equal(routeSync.status,200,JSON.stringify(routeSync.data));
        assert.equal(routeSync.data.complete,false);
        assert.equal(routeSync.data.coverage.complete,0);
        assert.equal(routeSync.data.coverage.oldestCursor,'route-confirmed-cursor');
        assert.equal(calls.filter((call)=>call.conversationId===routeAbsentCursor)[0].before,'route-confirmed-cursor');
        assert.equal(count('SELECT COUNT(*) AS count FROM conversation_message_cache WHERE page_id=? AND conversation_id=? AND message_id=?',
          FIXTURE.pageId,routeAbsentCursor,'route-absent-cursor-old'),1);
        const contradictoryRoute=await api(`/api/conversations/${routeContradictory}/history/sync`,{pageId:FIXTURE.pageId,pages:1,limit:5});
        assert.equal(contradictoryRoute.status,200,JSON.stringify(contradictoryRoute.data));
        assert.equal(contradictoryRoute.data.complete,false);
        assert.equal(contradictoryRoute.data.coverage.complete,0);
        assert.equal(contradictoryRoute.data.coverage.oldestCursor,'route-conflicting-cursor');
        const liveSync=await api(`/api/conversations/${liveRoute}/messages?pageId=${FIXTURE.pageId}&limit=50`);
        assert.equal(liveSync.status,200,JSON.stringify(liveSync.data));
        const liveState=db.prepare(`SELECT oldest_cursor AS cursor,complete,newest_message_at AS newest
          FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`).get(FIXTURE.pageId,liveRoute);
        assert.equal(liveState.cursor,'route-live-history-cursor');
        assert.equal(liveState.complete,0);
        assert.equal(liveState.newest,'2026-09-24T15:00:00.000Z');
        assert.equal(calls.filter((call)=>call.conversationId===liveRoute)[0].before,undefined);
      } finally { globalThis.fetch=originalFetch; }
    });

    await t.test('FIX-012: mapped student B can be graded even while the current conversation owner is A',async()=>{
      // message-a-old is historically owned by A and message-b by B in one shared contact thread.
      const created=createReviewSession({pageId:'page-test',studentId:studentB,conversationId:'conversation-shared',teacherInput:'Review B',
        sourceMessageId:'message-b',clientKey:'explicit-b-session',staffId:'staff-test'});
      assert.ok(created.id);
      assert.equal(db.prepare('SELECT student_id FROM student_review_sessions WHERE id=?').get(created.id).student_id,studentB);
      assert.equal(count(`SELECT COUNT(*) AS count FROM student_review_sessions WHERE student_id=? AND source_message_id='message-a-old'`,studentB),0);
    });

    const integrity=db.prepare('PRAGMA integrity_check').get();
    assert.equal(integrity.integrity_check,'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally {
    if(server.listening) await new Promise((resolve)=>server.close(resolve));
    db.close();
    fs.rmSync(tempDir,{recursive:true,force:true});
  }
});
