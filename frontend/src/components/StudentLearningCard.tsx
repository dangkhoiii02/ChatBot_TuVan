import { useEffect, useMemo, useState } from 'react';
import type { ChatMessage, IssueDetail, StudentFact, StudentIdentity, StudentIssue, StudentOption, StudentProposal, StudentSummary } from '../types';
import {
  createIssueOccurrence, createStudentAssignment, createStudentFact, decideStudentProposal, extractStudentProposals,
  getConversationMessageStudents, getStudentIssueDetail, getStudentIssues, linkConversationMessages, listStudentProposals, recordStudentSubmission,
  updateStudentAssignment, updateStudentFact, updateStudentIssue, updateStudentOccurrence, type ConversationMessageStudentLink
} from '../services/api';

type Props={
  identity:StudentIdentity|null; students:StudentOption[]; summary:StudentSummary|null;
  conversationId:string; messages:ChatMessage[];
  onLink:(input:{studentId?:string;newStudentName?:string;importLegacyContext?:boolean})=>Promise<void>;
  onOpenEvidence?:(conversationId:string,messageId?:string)=>void;
  onRefresh:()=>Promise<unknown>; onSyncHistory:()=>Promise<unknown>;
};

export function StudentLearningCard({identity,students,summary,conversationId,messages,onLink,onOpenEvidence,onRefresh,onSyncHistory}:Props) {
  const [studentId,setStudentId]=useState('');
  const [newName,setNewName]=useState('');
  const [importLegacy,setImportLegacy]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [factKind,setFactKind]=useState<StudentFact['kind']>('preference');
  const [factText,setFactText]=useState('');
  const [factExpiry,setFactExpiry]=useState('');
  const [factUse,setFactUse]=useState(true);
  const [factSourceMessageId,setFactSourceMessageId]=useState('');
  const [assignmentTitle,setAssignmentTitle]=useState('');
  const [assignmentStart,setAssignmentStart]=useState(new Date().toISOString().slice(0,10));
  const [view,setView]=useState<'all'|'recent'|'unresolved'>('all');
  const [selectedIssue,setSelectedIssue]=useState<string|null>(null);
  const [allIssues,setAllIssues]=useState<StudentIssue[]|null>(null);
  const [issueDetail,setIssueDetail]=useState<IssueDetail|null>(null);
  const [issueTitle,setIssueTitle]=useState('');
  const [issueSummary,setIssueSummary]=useState('');
  const [issueEvidenceId,setIssueEvidenceId]=useState('');
  const [issueEvidence,setIssueEvidence]=useState('');
  const [attachOccurrenceId,setAttachOccurrenceId]=useState('');
  const [attachMessageId,setAttachMessageId]=useState('');
  const [attachQuote,setAttachQuote]=useState('');
  const [issuePractice,setIssuePractice]=useState('');
  const [issueSource,setIssueSource]=useState<'teacher_confirmed'|'student_reported'|'staff_confirmed'>('teacher_confirmed');
  const [submissionMessageId,setSubmissionMessageId]=useState('');
  const [submissionAssignment,setSubmissionAssignment]=useState('');
  const [proposals,setProposals]=useState<StudentProposal[]>([]);
  const [messageLinks,setMessageLinks]=useState<ConversationMessageStudentLink[]>([]);
  const [messageStudentSelections,setMessageStudentSelections]=useState<Record<string,string>>({});
  const [proposalStatus,setProposalStatus]=useState('');
  const linkedId=identity?.student?.id;

  const candidateMessages=useMemo(()=>messages.filter((message)=>message.id&&message.text.trim())
    .slice().reverse().slice(0,40),[messages]);
  const issues=useMemo(()=>{
    const source=view==='unresolved'?(allIssues||summary?.unresolvedIssues||[]).filter((issue)=>issue.status!=='resolved'):(allIssues||summary?.issues||[]);
    if(view!=='recent') return source;
    return [...source].sort((a,b)=>Date.parse(b.lastOccurredAt||'')-Date.parse(a.lastOccurredAt||''));
  },[summary,allIssues,view]);

  useEffect(()=>{
    if(!linkedId){setAllIssues(null);return;}
    let active=true;
    const load=async()=>{
      const rows:StudentIssue[]=[];
      for(let offset=0;;offset+=100){
        const page=await getStudentIssues(linkedId,offset);
        rows.push(...page.items);
        if(page.items.length<100)break;
      }
      if(active)setAllIssues(rows);
    };
    load().catch((value)=>{if(active)setError(value instanceof Error?value.message:'Không tải được danh sách lỗi.')});
    return()=>{active=false};
  },[linkedId,summary?.revision]);

  useEffect(()=>{
    setStudentId(identity?.student?.id||''); setNewName(''); setImportLegacy(false);
    setSelectedIssue(null); setIssueDetail(null); setProposals([]); setProposalStatus('');setMessageLinks([]);setMessageStudentSelections({});
  },[identity?.conversationId,identity?.student?.id]);
  useEffect(()=>{
    if(!identity)return;
    let active=true;
    getConversationMessageStudents(identity.conversationId,identity.pageId).then((result)=>{if(active)setMessageLinks(result.items)}).catch(()=>{});
    return()=>{active=false};
  },[identity?.conversationId,identity?.pageId]);
  useEffect(()=>{
    if(!linkedId) return;
    let active=true;
    listStudentProposals(linkedId).then((result)=>{if(active)setProposals(result.items)}).catch((requestError)=>{
      if(active)setError(requestError instanceof Error?requestError.message:'Không tải được đề xuất.');
    });
    return()=>{active=false};
  },[linkedId,summary?.revision]);
  useEffect(()=>{
    if(!linkedId||!selectedIssue) {setIssueDetail(null);return}
    let active=true;
    getStudentIssueDetail(linkedId,selectedIssue).then((result)=>{if(active)setIssueDetail(result)}).catch((requestError)=>{
      if(active)setError(requestError instanceof Error?requestError.message:'Không tải được lịch sử lỗi.');
    });
    return()=>{active=false};
  },[linkedId,selectedIssue,summary?.revision]);

  const run=async(action:()=>Promise<unknown>)=>{
    setBusy(true);setError('');
    try { await action(); }
    catch(requestError) { setError(requestError instanceof Error?requestError.message:'Không lưu được dữ liệu.'); }
    finally { setBusy(false); }
  };
  const refresh=async()=>{await onRefresh()};
  const submitLink=()=>run(async()=>{
    await onLink({studentId:studentId||undefined,newStudentName:newName.trim()||undefined,importLegacyContext:importLegacy});
  });
  const submitFact=()=>run(async()=>{
    if(!linkedId||!factText.trim()) return;
    const source=candidateMessages.find((message)=>message.id===factSourceMessageId);
    await createStudentFact({studentId:linkedId,kind:factKind,content:factText.trim(),useInSuggestions:factUse,
      expiresAt:factExpiry?new Date(`${factExpiry}T23:59:59+07:00`).toISOString():undefined,
      sourceText:source?.text,sourceMessageId:source?.id,sourceConversationId:source?.id?conversationId:undefined});
    setFactText('');setFactExpiry('');setFactSourceMessageId('');await refresh();
  });
  const submitAssignment=()=>run(async()=>{
    if(!linkedId||!assignmentTitle.trim())return;
    await createStudentAssignment({studentId:linkedId,title:assignmentTitle.trim(),startedAt:assignmentStart?new Date(`${assignmentStart}T12:00:00+07:00`).toISOString():undefined,
      startedSource:'Nhân viên ghi nhận trong hồ sơ học viên.'});
    setAssignmentTitle('');await refresh();
  });
  const submitOccurrence=()=>run(async()=>{
    if(!linkedId||!issueTitle.trim()||!issueEvidence.trim())return;
    const selected=candidateMessages.find((message)=>message.id===issueEvidenceId);
    await createIssueOccurrence({studentId:linkedId,title:issueTitle.trim(),summary:issueSummary.trim()||undefined,
      occurredAt:selected?.createdAt||new Date().toISOString(),sourceKind:issueSource,conversationId,
      messageId:selected?.id,speaker:selected?.sender==='student'?'Học viên':selected?.sender==='staff'?'Giáo viên/nhân viên':'Nhân viên',
      verbatimText:issueEvidence.trim(),practiceAction:issuePractice.trim()||undefined});
    setIssueTitle('');setIssueSummary('');setIssueEvidence('');setIssuePractice('');await refresh();
  });
  const submitSubmission=()=>run(async()=>{
    if(!linkedId||!submissionMessageId)return;
    await recordStudentSubmission({studentId:linkedId,conversationId,messageId:submissionMessageId,assignmentTitle:submissionAssignment.trim()||undefined});
    setSubmissionMessageId('');setSubmissionAssignment('');await refresh();
  });
  const extract=()=>run(async()=>{
    if(!linkedId)return;
    const result=await extractStudentProposals({studentId:linkedId,conversationId});
    setProposals(result.items);setProposalStatus(`Đã tạo ${result.createdCount} đề xuất từ ${result.sourceMessageCount} tin chưa xử lý.${result.hasMore?' Còn tin để đọc tiếp.':''}`);
  });
  const decide=(proposalId:string,action:'accept'|'reject')=>run(async()=>{
    if(!linkedId)return;
    const result=await decideStudentProposal({studentId:linkedId,proposalId,action});
    setProposals(result.items);await refresh();
  });
  const markResolved=(issue:StudentIssue)=>run(async()=>{
    if(!linkedId)return;
    const evidence=window.prompt(`Căn cứ xác nhận “${issue.title}” đã sửa:`);
    if(!evidence?.trim())return;
    await updateStudentIssue({studentId:linkedId,issueId:issue.id,revision:issue.revision,status:'resolved',statusEvidence:evidence.trim()});
    await refresh();
  });
  const archiveFact=(fact:StudentFact)=>run(async()=>{
    if(!linkedId)return;
    await updateStudentFact({studentId:linkedId,factId:fact.id,status:fact.status==='archived'?'active':'archived'});
    await refresh();
  });
  const assignMessage= (messageId:string)=>run(async()=>{
    if(!identity)return;
    const studentId=messageStudentSelections[messageId];
    if(!studentId)return;
    const current=messageLinks.find((link)=>link.messageId===messageId);
    const reassign=Boolean(current&&current.studentId!==studentId);
    if(reassign&&!window.confirm(`Chuyển tin này từ ${current?.studentName} sang học viên đã chọn?`))return;
    const result=await linkConversationMessages({conversationId:identity.conversationId,pageId:identity.pageId,studentId,messageIds:[messageId],reassign});
    setMessageLinks(result);await refresh();
  });
  const setEvidenceFromMessage=(messageId:string)=>{
    setIssueEvidenceId(messageId);
    const message=candidateMessages.find((item)=>item.id===messageId);
    if(message)setIssueEvidence(message.text);
  };
  const setAdditionalEvidenceMessage=(messageId:string)=>{
    setAttachMessageId(messageId);
    setAttachQuote(candidateMessages.find((item)=>item.id===messageId)?.text||'');
  };

  return <section className="student-learning-card" aria-label="Hồ sơ học tập và tiến độ trả bài">
    <div className="learning-card-heading">
      <div><strong>Hồ sơ học viên & tiến độ</strong><small>Thông tin dùng cho gợi ý phải được nhân viên xác nhận.</small></div>
      {identity?.status==='linked'&&<span className="learning-identity-badge">{identity.student?.name}</span>}
    </div>
    {identity?.status!=='linked'?<div className="learning-link-form">
      <p>Chưa gắn hội thoại với hồ sơ học viên. Tạo hoặc chọn học viên trước khi lưu lỗi và ghi nhớ.</p>
      <label>Hồ sơ có sẵn<select value={studentId} onChange={(event)=>{setStudentId(event.target.value);setNewName('')}}>
        <option value="">Tạo hồ sơ mới…</option>{students.map((student)=><option key={student.id} value={student.id}>{student.name}</option>)}
      </select></label>
      {!studentId&&<label>Tên học viên<input value={newName} onChange={(event)=>setNewName(event.target.value)} placeholder="Nhập đúng tên học viên" /></label>}
      {identity?.legacyContextAvailable&&<label className="learning-check"><input type="checkbox" checked={importLegacy} onChange={(event)=>setImportLegacy(event.target.checked)} />
        Sao chép ghi chú hồ sơ cũ của tài khoản/hội thoại sang hồ sơ mới</label>}
      <button type="button" className="btn-primary-small" disabled={busy||(!studentId&&!newName.trim())} onClick={submitLink}>{busy?'Đang lưu…':'Gắn với học viên'}</button>
    </div>:<>
      <div className="learning-identity-switch"><span>Hội thoại này đang dùng hồ sơ <b>{identity.student?.name}</b>.</span>
        <details><summary>Đổi học viên</summary><label><select value={studentId} onChange={(event)=>setStudentId(event.target.value)}>
          <option value="">Chọn hồ sơ…</option>{students.map((student)=><option key={student.id} value={student.id}>{student.name}</option>)}
        </select></label><button type="button" className="btn-secondary" disabled={busy||!studentId||studentId===linkedId} onClick={submitLink}>Gắn hồ sơ đã chọn</button></details>
      </div>
      {summary&&<>
        <div className="learning-coverage">
          <span>Lịch sử: {summary.historyCoverage.status==='complete'?'đã bao phủ':summary.historyCoverage.status==='partial'?'một phần — số liệu ít nhất':'chưa đồng bộ'}</span>
          {summary.historyCoverage.oldestMessageAt&&<span>Từ {new Date(summary.historyCoverage.oldestMessageAt).toLocaleDateString('vi-VN')}</span>}
          {summary.historyCoverage.lastSyncedAt&&<span>Cập nhật {new Date(summary.historyCoverage.lastSyncedAt).toLocaleString('vi-VN')}</span>}
        </div>
        <div className="learning-actions-row">
          <button type="button" className="btn-secondary" disabled={busy} onClick={()=>run(onSyncHistory)}>Đồng bộ thêm lịch sử</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={extract}>Đọc tin chưa xử lý, đề xuất dữ kiện</button>
        </div>
        {summary.historyCoverage.errors.map((item,index)=><small className="learning-warning" key={index}>{item}</small>)}
        {candidateMessages.length>0&&<details className="learning-message-identity"><summary>Gắn tin riêng cho từng học viên ({messageLinks.length} tin đã gắn)</summary>
          <small>Mặc định, các tin dùng hồ sơ của hội thoại. Dùng mục này khi một tài khoản/hội thoại có nhiều người học.</small>
          {candidateMessages.slice(-12).reverse().map((message)=>{
            const mapping=messageLinks.find((link)=>link.messageId===message.id);
            const selected=messageStudentSelections[message.id]??mapping?.studentId??identity.student?.id??'';
            return <div className="learning-message-map" key={message.id}><span><b>{message.sender==='student'?'Khách hàng':'Nhân viên'}</b> · {new Date(message.createdAt||message.sentAt).toLocaleDateString('vi-VN')}<small>{message.text.slice(0,90)}</small>
              <small>{mapping?`Đã gắn: ${mapping.studentName}`:`Mặc định: ${identity.student?.name}`}</small></span>
              <select aria-label="Học viên của tin nhắn" value={selected} onChange={(event)=>setMessageStudentSelections((current)=>({...current,[message.id]:event.target.value}))}>
                <option value="">Chọn học viên…</option>{students.map((student)=><option key={student.id} value={student.id}>{student.name}</option>)}
              </select><button type="button" disabled={busy||!selected||selected===(mapping?.studentId||identity.student?.id)} onClick={()=>assignMessage(message.id)}>Gắn</button>
            </div>;
          })}
        </details>}
        <div className="learning-section">
          <strong>Ghi nhớ đã xác nhận</strong>
          {summary.facts.length===0?<small>Chưa có ghi nhớ hiệu lực.</small>:summary.facts.map((fact)=><div className="learning-fact" key={fact.id}>
            <span>{fact.content}<small>{fact.kind==='preference'?'Yêu cầu':fact.kind==='event'?'Sự kiện':'Cách học'}{fact.expiresAt?` · đến ${new Date(fact.expiresAt).toLocaleDateString('vi-VN')}`:''}</small>
              {fact.sourceText&&<small>Nguồn: “{fact.sourceText}”</small>}</span>
            <button type="button" onClick={()=>archiveFact(fact)} disabled={busy}>Lưu trữ</button>
          </div>)}
          {summary.expiredFacts?.length>0&&<details className="learning-expired-facts"><summary>Đã hết hiệu lực ({summary.expiredFacts.length})</summary>
            {summary.expiredFacts.map((fact)=><div className="learning-fact" key={fact.id}><span>{fact.content}<small>Hết hiệu lực {fact.expiresAt?new Date(fact.expiresAt).toLocaleDateString('vi-VN'):'—'}{fact.sourceText?` · nguồn: “${fact.sourceText}”`:''}</small></span>
              <button type="button" onClick={()=>archiveFact(fact)} disabled={busy}>Lưu trữ</button></div>)}</details>}
          <div className="learning-inline-form">
            <select value={factKind} onChange={(event)=>setFactKind(event.target.value as StudentFact['kind'])}>
              <option value="preference">Yêu cầu / xưng hô</option><option value="event">Sự kiện</option><option value="learning_note">Lưu ý cách học</option>
            </select><input value={factText} onChange={(event)=>setFactText(event.target.value)} placeholder="Nội dung đã được xác nhận" />
            {candidateMessages.length>0&&<select value={factSourceMessageId} onChange={(event)=>setFactSourceMessageId(event.target.value)}><option value="">Tin nguồn (không bắt buộc)</option>
              {candidateMessages.map((message)=><option key={message.id} value={message.id}>{message.sender==='student'?'Học viên':'Nhân viên'} · {message.text.slice(0,55)}</option>)}</select>}
            <input type="date" aria-label="Ngày hết hiệu lực" value={factExpiry} onChange={(event)=>setFactExpiry(event.target.value)} />
            <label className="learning-check"><input type="checkbox" checked={factUse} onChange={(event)=>setFactUse(event.target.checked)} />Dùng cho AI</label>
            <button type="button" disabled={busy||!factText.trim()} onClick={submitFact}>Thêm</button>
          </div>
        </div>
        <div className="learning-section">
          <strong>Bài đang tập</strong>
          {summary.assignments.filter((item)=>item.status!=='completed').map((item)=><div className="learning-assignment" key={item.id}>
            <b>{item.title}</b><span>{item.durationLabel} · {item.reviewSessionCount} lượt đã xác nhận</span>
            {item.pendingSubmissionCount>0&&<em>{item.pendingSubmissionCount} bài nộp chờ nhận xét</em>}
            <button type="button" className="learning-resolve" disabled={busy} onClick={()=>run(async()=>{
              const evidence=window.prompt(`Căn cứ xác nhận đã vượt bài “${item.title}”:`);if(!evidence?.trim())return;
              await updateStudentAssignment({studentId:linkedId!,assignmentId:item.id,revision:item.revision,status:'completed',completionEvidence:evidence.trim()});await refresh();
            })}>Đã vượt bài</button>
          </div>)}
          {summary.assignments.filter((item)=>item.status!=='completed').length===0&&<small>Chưa ghi nhận bài đang tập.</small>}
          <div className="learning-inline-form"><input value={assignmentTitle} onChange={(event)=>setAssignmentTitle(event.target.value)} placeholder="Tên bài / đoạn nhạc" />
            <input type="date" aria-label="Bắt đầu từ ngày" value={assignmentStart} onChange={(event)=>setAssignmentStart(event.target.value)} />
            <button type="button" disabled={busy||!assignmentTitle.trim()} onClick={submitAssignment}>Thêm bài</button>
          </div>
          {candidateMessages.length>0&&<div className="learning-inline-form"><select value={submissionMessageId} onChange={(event)=>setSubmissionMessageId(event.target.value)}>
            <option value="">Chọn tin học viên đã nộp bài…</option>{candidateMessages.filter((message)=>message.sender==='student').map((message)=><option key={message.id} value={message.id}>{new Date(message.createdAt||message.sentAt).toLocaleDateString('vi-VN')} · {message.text.slice(0,70)}</option>)}
          </select><input value={submissionAssignment} onChange={(event)=>setSubmissionAssignment(event.target.value)} placeholder="Tên bài nếu đã biết" />
          <button type="button" disabled={busy||!submissionMessageId} onClick={submitSubmission}>Ghi nhận bài nộp</button></div>}
        </div>
        <div className="learning-section">
          <div className="learning-list-heading"><strong>Lỗi trước đây – cách sửa gần nhất</strong><div>
            {(['all','recent','unresolved'] as const).map((option)=><button type="button" key={option} className={view===option?'selected':''} onClick={()=>setView(option)}>
              {option==='all'?'Tất cả':option==='recent'?'Gần đây':'Chưa xác nhận sửa'}</button>)}
          </div></div>
          {issues.length===0?<small>Chưa có lỗi đã xác nhận trong mục này.</small>:issues.map((issue)=><div className="learning-issue" key={issue.id}>
            <button type="button" className="learning-issue-open" onClick={()=>setSelectedIssue((value)=>value===issue.id?null:issue.id)}>
              <b>{issue.title}</b><span>{issue.occurrenceCount} lần xuất hiện · {issue.reviewSessionCount} lượt trả bài</span>
              <small>{issue.lastOccurredAt?`Gần nhất ${new Date(issue.lastOccurredAt).toLocaleDateString('vi-VN')}`:'Mốc chưa rõ'} · {issue.status==='needs_verification'?'chưa xác nhận hiện trạng':issue.status==='active'?'đang gặp':issue.status==='recurred'?'tái phát':'đã sửa'}</small>
              <small>{issue.messageMentionCount} tin có dẫn chứng{issue.latestSourceKind?` · nguồn gần nhất: ${issue.latestSourceKind==='student_reported'?'học viên tự báo':issue.latestSourceKind==='teacher_confirmed'?'giáo viên xác nhận':'nhân viên xác nhận'}`:''}</small>
              <small>Cách sửa gần nhất: {issue.latestPracticeAction||'chưa có hướng dẫn đã lưu'}</small>
            </button>
            {issue.status!=='resolved'&&<button type="button" className="learning-resolve" disabled={busy} onClick={()=>markResolved(issue)}>Xác nhận đã sửa</button>}
          </div>)}
          {selectedIssue&&issueDetail&&<div className="learning-evidence-detail"><b>{issueDetail.issue.title} · lịch sử nguồn</b>
          {issueDetail.occurrences.map((occurrence)=><div className="learning-occurrence" key={occurrence.id}><span>{new Date(occurrence.occurredAt).toLocaleString('vi-VN')} · {occurrence.sourceKind==='student_reported'?'học viên tự báo':occurrence.sourceKind==='teacher_confirmed'?'giáo viên xác nhận':'nhân viên xác nhận'} · {occurrence.approved?'đang tính':'đã loại khỏi thống kê'}</span>
              <button type="button" onClick={()=>run(async()=>{await updateStudentOccurrence({studentId:linkedId!,issueId:issueDetail.issue.id,occurrenceId:occurrence.id,revision:occurrence.revision,approved:!Boolean(occurrence.approved)});await refresh()})} disabled={busy}>{occurrence.approved?'Loại mốc':'Khôi phục mốc'}</button>
              <button type="button" onClick={()=>run(async()=>{const title=window.prompt('Nhập tên lỗi đích. Tên lỗi có sẵn sẽ gộp; tên mới sẽ tách thành lỗi riêng.');if(!title?.trim())return;
                await updateStudentOccurrence({studentId:linkedId!,issueId:issueDetail.issue.id,occurrenceId:occurrence.id,revision:occurrence.revision,targetIssueTitle:title.trim()});setSelectedIssue(null);await refresh()})} disabled={busy}>Gộp / tách lỗi</button>
            </div>)}
            {candidateMessages.length>0&&issueDetail.occurrences.length>0&&<div className="learning-add-evidence"><b>Gắn thêm tin vào một mốc hiện có — không tăng số lần xuất hiện</b>
              <select value={attachOccurrenceId} onChange={(event)=>setAttachOccurrenceId(event.target.value)}><option value="">Chọn mốc lỗi…</option>{issueDetail.occurrences.map((item)=><option key={item.id} value={item.id}>{new Date(item.occurredAt).toLocaleDateString('vi-VN')} · {item.sourceKind}</option>)}</select>
              <select value={attachMessageId} onChange={(event)=>setAdditionalEvidenceMessage(event.target.value)}><option value="">Chọn tin nguồn…</option>{candidateMessages.map((message)=><option key={message.id} value={message.id}>{message.sender==='student'?'Học viên':'Nhân viên'} · {message.text.slice(0,60)}</option>)}</select>
              <textarea value={attachQuote} onChange={(event)=>setAttachQuote(event.target.value)} placeholder="Trích nguyên văn, phải khớp với tin đã chọn" />
              <button type="button" disabled={busy||!attachOccurrenceId||!attachMessageId||!attachQuote.trim()} onClick={()=>run(async()=>{
                const occurrence=issueDetail.occurrences.find((item)=>item.id===attachOccurrenceId);if(!occurrence)return;
                const result=await updateStudentOccurrence({studentId:linkedId!,issueId:issueDetail.issue.id,occurrenceId:occurrence.id,revision:occurrence.revision,
                  evidenceConversationId:conversationId,evidenceMessageId:attachMessageId,evidenceText:attachQuote.trim()});
                setIssueDetail(result);setAttachMessageId('');setAttachOccurrenceId('');setAttachQuote('');await refresh();
              })}>Gắn bằng chứng</button>
            </div>}
            {issueDetail.evidence.map((item)=><blockquote key={item.id}><span>{item.speaker} · {new Date(item.occurredAt).toLocaleString('vi-VN')}</span>
              <p>“{item.verbatimText}”</p>{item.messageId&&<small>Tin nguồn {item.messageId}</small>}
              {item.conversationId&&<button type="button" className="learning-source-link" onClick={()=>onOpenEvidence?.(item.conversationId!,item.messageId||undefined)}>Mở hội thoại nguồn</button>}</blockquote>)}
            {issueDetail.evidence.length===0&&<small>Thiếu bản tin nguyên văn nguồn.</small>}
          </div>}
          <details className="learning-add-occurrence"><summary>Ghi nhận một lần xuất hiện có căn cứ</summary>
            <div className="learning-inline-form"><input value={issueTitle} onChange={(event)=>setIssueTitle(event.target.value)} placeholder="Tên lỗi kỹ thuật" />
              <select value={issueSource} onChange={(event)=>setIssueSource(event.target.value as typeof issueSource)}><option value="teacher_confirmed">Giáo viên đã xác nhận</option><option value="student_reported">Học viên tự báo</option><option value="staff_confirmed">Nhân viên đã xác nhận</option></select>
              <select value={issueEvidenceId} onChange={(event)=>setEvidenceFromMessage(event.target.value)}><option value="">Chọn tin nguồn (không bắt buộc)</option>{candidateMessages.map((message)=><option key={message.id} value={message.id}>{message.sender==='student'?'Học viên':'Giáo viên'} · {message.text.slice(0,60)}</option>)}</select>
              <textarea value={issueEvidence} onChange={(event)=>setIssueEvidence(event.target.value)} placeholder="Trích nguyên văn bằng chứng" />
              <input value={issueSummary} onChange={(event)=>setIssueSummary(event.target.value)} placeholder="Tóm tắt (có thể để trống)" />
              <input value={issuePractice} onChange={(event)=>setIssuePractice(event.target.value)} placeholder="Cách sửa giáo viên đã dặn (nếu có)" />
              <button type="button" disabled={busy||!issueTitle.trim()||!issueEvidence.trim()} onClick={submitOccurrence}>Lưu lần xuất hiện</button>
            </div>
          </details>
        </div>
        <div className="learning-section learning-proposals">
          <strong>Đề xuất chờ duyệt ({proposals.length})</strong>{proposalStatus&&<small>{proposalStatus}</small>}
          {proposals.map((proposal)=><article key={proposal.id}><span className="proposal-kind">{proposal.kind}</span>
            <b>{String(proposal.payload.title||proposal.payload.content||proposal.payload.summary||'Đề xuất dữ kiện')}</b>
            <small>{proposal.sourceText?`Nguồn: “${proposal.sourceText}”`:'Thiếu trích dẫn nguyên văn'} {proposal.confidence?`· ${Math.round(proposal.confidence*100)}%`:''}</small>
            <div><button type="button" disabled={busy} onClick={()=>decide(proposal.id,'accept')}>Duyệt</button><button type="button" disabled={busy} onClick={()=>decide(proposal.id,'reject')}>Từ chối</button></div>
          </article>)}
          {proposals.length===0&&<small>AI không tự lưu hồ sơ; các đề xuất mới sẽ hiện ở đây để duyệt.</small>}
        </div>
      </>}
    </>}
    {error&&<div className="learning-error" role="alert">{error}</div>}
    {busy&&<small role="status">Đang lưu…</small>}
  </section>;
}
