import { useEffect, useMemo, useState } from 'react';
import type { ApiChatMessage, StudentFactApi, StudentIdentityApi, StudentIssueApi, StudentOptionApi, StudentProposalApi, StudentSummaryApi } from '../../lib/api';
import {
  createIssueOccurrence, createStudentAssignment, createStudentFact, decideStudentProposal, extractStudentProposals,
  getConversationMessageStudents, getStudentIssueDetail, getStudentIssues, linkConversationMessages, listStudentProposals, recordStudentSubmission,
  updateStudentAssignment, updateStudentFact, updateStudentIssue, updateStudentOccurrence, type ConversationMessageStudentLinkApi
} from '../../lib/api';

interface Props {
  identity:StudentIdentityApi|null; students:StudentOptionApi[]; summary:StudentSummaryApi|null;
  conversationId:string; messages:ApiChatMessage[];
  onLink:(input:{studentId?:string;newStudentName?:string;importLegacyContext?:boolean})=>Promise<void>;
  onRefresh:()=>Promise<unknown>; onSyncHistory:()=>Promise<unknown>;
}

export function StudentLearningTab({identity,students,summary,conversationId,messages,onLink,onRefresh,onSyncHistory}:Props) {
  const [selectedStudent,setSelectedStudent]=useState('');const [newName,setNewName]=useState('');const [importLegacy,setImportLegacy]=useState(false);
  const [kind,setKind]=useState<StudentFactApi['kind']>('preference');const [fact,setFact]=useState('');const [expiry,setExpiry]=useState('');const [useFact,setUseFact]=useState(true);
  const [factSourceMessage,setFactSourceMessage]=useState('');
  const [assignment,setAssignment]=useState('');const [startedAt,setStartedAt]=useState(new Date().toISOString().slice(0,10));
  const [view,setView]=useState<'all'|'recent'|'unresolved'>('all');const [issueId,setIssueId]=useState<string|null>(null);
  const [allIssues,setAllIssues]=useState<StudentIssueApi[]|null>(null);
  const [issueDetail,setIssueDetail]=useState<Awaited<ReturnType<typeof getStudentIssueDetail>>|null>(null);
  const [issueTitle,setIssueTitle]=useState('');const [issueQuote,setIssueQuote]=useState('');const [sourceMessage,setSourceMessage]=useState('');
  const [attachOccurrenceId,setAttachOccurrenceId]=useState('');const [attachMessageId,setAttachMessageId]=useState('');const [attachQuote,setAttachQuote]=useState('');
  const [sourceKind,setSourceKind]=useState<'teacher_confirmed'|'student_reported'|'staff_confirmed'>('teacher_confirmed');const [practice,setPractice]=useState('');
  const [submissionId,setSubmissionId]=useState('');const [submissionAssignment,setSubmissionAssignment]=useState('');
  const [proposals,setProposals]=useState<StudentProposalApi[]>([]);const [status,setStatus]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [messageLinks,setMessageLinks]=useState<ConversationMessageStudentLinkApi[]>([]);const [messageStudentSelections,setMessageStudentSelections]=useState<Record<string,string>>({});
  const studentId=identity?.student?.id;
  const candidateMessages=useMemo(()=>messages.filter((message)=>message.text.trim()).slice().reverse().slice(0,30),[messages]);
  const issues=useMemo(()=>{
    const items=view==='unresolved'?(allIssues||summary?.unresolvedIssues||[]).filter((issue)=>issue.status!=='resolved'):(allIssues||summary?.issues||[]);
    return view==='recent'?[...items].sort((a,b)=>Date.parse(b.lastOccurredAt||'')-Date.parse(a.lastOccurredAt||'')):items;
  },[summary,allIssues,view]);
  useEffect(()=>{
    if(!studentId){setAllIssues(null);return;}
    let active=true;
    const load=async()=>{
      const rows:StudentIssueApi[]=[];
      for(let offset=0;;offset+=100){
        const page=await getStudentIssues(studentId,offset);
        rows.push(...page.items);
        if(page.items.length<100)break;
      }
      if(active)setAllIssues(rows);
    };
    load().catch((value)=>{if(active)setError(value instanceof Error?value.message:'Không tải được danh sách lỗi')});
    return()=>{active=false};
  },[studentId,summary?.revision]);
  useEffect(()=>{setSelectedStudent(identity?.student?.id||'');setNewName('');setImportLegacy(false);setIssueId(null);setIssueDetail(null);setProposals([]);setMessageLinks([]);setMessageStudentSelections({})},[identity?.conversationId,identity?.student?.id]);
  useEffect(()=>{if(!identity)return;let active=true;getConversationMessageStudents(identity.conversationId,identity.pageId).then((result)=>{if(active)setMessageLinks(result.items)}).catch(()=>{});return()=>{active=false}},[identity?.conversationId,identity?.pageId]);
  useEffect(()=>{
    if(!studentId)return;let active=true;
    listStudentProposals(studentId).then((result)=>{if(active)setProposals(result.items)}).catch((value)=>{if(active)setError(value instanceof Error?value.message:'Không tải được đề xuất')});
    return()=>{active=false};
  },[studentId,summary?.revision]);
  useEffect(()=>{
    if(!studentId||!issueId){setIssueDetail(null);return}let active=true;
    getStudentIssueDetail(studentId,issueId).then((result)=>{if(active)setIssueDetail(result)}).catch((value)=>{if(active)setError(value instanceof Error?value.message:'Không tải được căn cứ')});
    return()=>{active=false};
  },[studentId,issueId,summary?.revision]);
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action()}catch(value){setError(value instanceof Error?value.message:'Không lưu được dữ liệu')}finally{setBusy(false)}};
  const refresh=async()=>{await onRefresh()};
  const setAdditionalEvidenceMessage=(messageId:string)=>{setAttachMessageId(messageId);setAttachQuote(candidateMessages.find((item)=>item.id===messageId)?.text||'')};
  const assignMessage=(messageId:string)=>run(async()=>{if(!identity)return;const target=messageStudentSelections[messageId];if(!target)return;
    const current=messageLinks.find((link)=>link.messageId===messageId);const reassign=Boolean(current&&current.studentId!==target);
    if(reassign&&!window.confirm(`Chuyển tin này từ ${current?.studentName} sang học viên đã chọn?`))return;
    const result=await linkConversationMessages({conversationId:identity.conversationId,pageId:identity.pageId,studentId:target,messageIds:[messageId],reassign});
    setMessageLinks(result);await refresh()});

  return <div className="tab-panel student-learning-tab">
    {identity?.status!=='linked'?<section className="learning-card">
      <h3>Chọn hồ sơ học viên</h3><p>Hội thoại chưa được gắn với một học viên. Hồ sơ cũ sẽ không được dùng cho gợi ý.</p>
      <label>Chọn hồ sơ có sẵn<select value={selectedStudent} onChange={(event)=>{setSelectedStudent(event.target.value);setNewName('')}}>
        <option value="">Tạo hồ sơ mới…</option>{students.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {!selectedStudent&&<label>Tên học viên<input value={newName} onChange={(event)=>setNewName(event.target.value)} placeholder="Nhập đúng tên học viên" /></label>}
      {identity?.legacyContextAvailable&&<label className="learning-check"><input type="checkbox" checked={importLegacy} onChange={(event)=>setImportLegacy(event.target.checked)} />Sao chép ghi chú hồ sơ cũ để nhân viên rà soát</label>}
      <button type="button" className="btn btn-primary" disabled={busy||(!selectedStudent&&!newName.trim())} onClick={()=>run(()=>onLink({studentId:selectedStudent||undefined,newStudentName:newName.trim()||undefined,importLegacyContext:importLegacy}))}>Gắn hội thoại với học viên</button>
    </section>:<>
      <section className="learning-card">
        <div className="learning-heading"><h3>Hồ sơ học viên: {identity.student?.name}</h3><details><summary>Đổi hồ sơ</summary>
          <select value={selectedStudent} onChange={(event)=>setSelectedStudent(event.target.value)}><option value="">Chọn học viên…</option>{students.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button type="button" className="btn btn-outline" disabled={busy||!selectedStudent||selectedStudent===studentId} onClick={()=>run(()=>onLink({studentId:selectedStudent}))}>Gắn hồ sơ</button>
        </details></div>
        {summary&&<div className="learning-coverage">Lịch sử {summary.historyCoverage.status==='complete'?'đã bao phủ':summary.historyCoverage.status==='partial'?'chưa đầy đủ — số liệu ít nhất':'chưa đồng bộ'}
          {summary.historyCoverage.oldestMessageAt&&<span> · từ {new Date(summary.historyCoverage.oldestMessageAt).toLocaleDateString('vi-VN')}</span>}
          {summary.historyCoverage.lastSyncedAt&&<span> · cập nhật {new Date(summary.historyCoverage.lastSyncedAt).toLocaleString('vi-VN')}</span>}
        </div>}
        <div className="learning-actions"><button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(onSyncHistory)}>Đồng bộ thêm lịch sử</button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{const result=await extractStudentProposals({studentId:studentId!,conversationId});setProposals(result.items);setStatus(`Đã tạo ${result.createdCount} đề xuất từ ${result.sourceMessageCount} tin chưa xử lý.${result.hasMore?' Còn tin để đọc tiếp.':''}`)})}>AI đề xuất từ tin chưa xử lý</button></div>
        {summary?.historyCoverage.errors.map((item,index)=><small className="learning-warning" key={index}>{item}</small>)}
        {candidateMessages.length>0&&<details className="learning-message-identity"><summary>Gắn tin riêng cho từng học viên ({messageLinks.length} tin đã gắn)</summary>
          <small>Mặc định, các tin dùng hồ sơ của hội thoại. Dùng mục này khi một tài khoản/hội thoại có nhiều người học.</small>
          {candidateMessages.slice(0,12).map((message)=>{const mapping=messageLinks.find((link)=>link.messageId===message.id);const selected=messageStudentSelections[message.id]??mapping?.studentId??identity.student?.id??'';
            return <div className="learning-message-map" key={message.id}><span><b>{message.sender==='student'?'Khách hàng':'Nhân viên'}</b> · {new Date(message.createdAt).toLocaleDateString('vi-VN')}<small>{message.text.slice(0,90)}</small>
              <small>{mapping?`Đã gắn: ${mapping.studentName}`:`Mặc định: ${identity.student?.name}`}</small></span>
              <select aria-label="Học viên của tin nhắn" value={selected} onChange={(event)=>setMessageStudentSelections((current)=>({...current,[message.id]:event.target.value}))}>
                <option value="">Chọn học viên…</option>{students.map((student)=><option key={student.id} value={student.id}>{student.name}</option>)}</select>
              <button type="button" disabled={busy||!selected||selected===(mapping?.studentId||identity.student?.id)} onClick={()=>assignMessage(message.id)}>Gắn</button></div>;
          })}
        </details>}
      </section>
      <section className="learning-card"><h3>Ghi nhớ đã xác nhận</h3>
        {summary?.facts.map((item)=><div className="learning-row" key={item.id}><span>{item.content}<small>{item.kind==='preference'?'Yêu cầu / xưng hô':item.kind==='event'?'Sự kiện':'Cách học'}{item.expiresAt?` · hết hạn ${new Date(item.expiresAt).toLocaleDateString('vi-VN')}`:''}</small>
          {item.sourceText&&<small>Nguồn: “{item.sourceText}”</small>}</span>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{await updateStudentFact({studentId:studentId!,factId:item.id,status:'archived'});await refresh()})}>Lưu trữ</button></div>)}
        {(summary?.expiredFacts.length||0)>0&&<details className="learning-expired-facts"><summary>Đã hết hiệu lực ({summary?.expiredFacts.length})</summary>
          {summary?.expiredFacts.map((item)=><div className="learning-row" key={item.id}><span>{item.content}<small>Hết hiệu lực {item.expiresAt?new Date(item.expiresAt).toLocaleDateString('vi-VN'):'—'}{item.sourceText?` · nguồn: “${item.sourceText}”`:''}</small></span>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{await updateStudentFact({studentId:studentId!,factId:item.id,status:'archived'});await refresh()})}>Lưu trữ</button></div>)}</details>}
        <div className="learning-form"><select value={kind} onChange={(event)=>setKind(event.target.value as StudentFactApi['kind'])}><option value="preference">Yêu cầu / xưng hô</option><option value="event">Sự kiện</option><option value="learning_note">Lưu ý cách học</option></select>
          <input value={fact} onChange={(event)=>setFact(event.target.value)} placeholder="Nội dung đã được xác nhận" />
          {candidateMessages.length>0&&<select value={factSourceMessage} onChange={(event)=>setFactSourceMessage(event.target.value)}><option value="">Tin nguồn (không bắt buộc)</option>{candidateMessages.map((message)=><option key={message.id} value={message.id}>{message.sender==='student'?'Học viên':'Nhân viên'} · {message.text.slice(0,55)}</option>)}</select>}
          <input type="date" value={expiry} onChange={(event)=>setExpiry(event.target.value)} aria-label="Ngày hết hiệu lực" />
          <label className="learning-check"><input type="checkbox" checked={useFact} onChange={(event)=>setUseFact(event.target.checked)} />Dùng cho AI</label>
          <button type="button" disabled={busy||!fact.trim()} onClick={()=>run(async()=>{const source=candidateMessages.find((message)=>message.id===factSourceMessage);
            await createStudentFact({studentId:studentId!,kind,content:fact.trim(),useInSuggestions:useFact,sourceText:source?.text,sourceMessageId:source?.id,
              sourceConversationId:source?.id?conversationId:undefined,expiresAt:expiry?new Date(`${expiry}T23:59:59+07:00`).toISOString():undefined});setFact('');setExpiry('');setFactSourceMessage('');await refresh()})}>Thêm ghi nhớ</button>
        </div>
      </section>
      <section className="learning-card"><h3>Bài đang tập</h3>
        {summary?.assignments.filter((item)=>item.status!=='completed').map((item)=><div className="learning-assignment" key={item.id}><b>{item.title}</b><span>{item.durationLabel} · {item.reviewSessionCount} lượt trả bài đã xác nhận</span>
          {item.pendingSubmissionCount>0&&<em>{item.pendingSubmissionCount} bài nộp chờ nhận xét</em>}
          <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{const evidence=window.prompt(`Căn cứ xác nhận đã vượt bài “${item.title}”:`);if(!evidence?.trim())return;
            await updateStudentAssignment({studentId:studentId!,assignmentId:item.id,revision:item.revision,status:'completed',completionEvidence:evidence.trim()});await refresh()})}>Đã vượt bài</button></div>)}
        <div className="learning-form"><input value={assignment} onChange={(event)=>setAssignment(event.target.value)} placeholder="Tên bài / đoạn nhạc" /><input type="date" value={startedAt} onChange={(event)=>setStartedAt(event.target.value)} aria-label="Bắt đầu từ ngày" />
          <button type="button" disabled={busy||!assignment.trim()} onClick={()=>run(async()=>{await createStudentAssignment({studentId:studentId!,title:assignment.trim(),startedAt:startedAt?new Date(`${startedAt}T12:00:00+07:00`).toISOString():undefined,startedSource:'Nhân viên ghi nhận'});setAssignment('');await refresh()})}>Thêm bài</button>
        </div>
        {candidateMessages.some((message)=>message.sender==='student')&&<div className="learning-form"><select value={submissionId} onChange={(event)=>setSubmissionId(event.target.value)}><option value="">Chọn tin đã nộp bài…</option>{candidateMessages.filter((message)=>message.sender==='student').map((message)=><option key={message.id} value={message.id}>{new Date(message.createdAt).toLocaleDateString('vi-VN')} · {message.text.slice(0,50)}</option>)}</select>
          <input value={submissionAssignment} onChange={(event)=>setSubmissionAssignment(event.target.value)} placeholder="Tên bài nếu biết" />
          <button type="button" disabled={busy||!submissionId} onClick={()=>run(async()=>{await recordStudentSubmission({studentId:studentId!,conversationId,messageId:submissionId,assignmentTitle:submissionAssignment.trim()||undefined});setSubmissionId('');setSubmissionAssignment('');await refresh()})}>Ghi nhận bài nộp</button>
        </div>}
      </section>
      <section className="learning-card"><div className="learning-heading"><h3>Lỗi trước đây — cách sửa gần nhất</h3><div className="learning-filters">{(['all','recent','unresolved'] as const).map((item)=><button key={item} type="button" className={view===item?'active':''} onClick={()=>setView(item)}>{item==='all'?'Tất cả':item==='recent'?'Gần đây':'Chưa sửa'}</button>)}</div></div>
        {issues.length===0&&<small>Chưa có lỗi được ghi nhận ở mục này.</small>}{issues.map((issue)=><div className="learning-issue" key={issue.id}>
          <button type="button" className="learning-issue-main" onClick={()=>setIssueId(issueId===issue.id?null:issue.id)}><b>{issue.title}</b><span>{issue.occurrenceCount} lần · {issue.reviewSessionCount} lượt trả bài · {issue.status}</span>
            <small>{issue.lastOccurredAt?new Date(issue.lastOccurredAt).toLocaleDateString('vi-VN'):'mốc chưa rõ'} · {issue.messageMentionCount} tin có dẫn chứng · {issue.latestSourceKind==='student_reported'?'học viên tự báo':issue.latestSourceKind==='teacher_confirmed'?'giáo viên xác nhận':issue.latestSourceKind==='staff_confirmed'?'nhân viên xác nhận':'chưa rõ nguồn'}</small>
            <small>{issue.latestPracticeAction||'chưa có cách sửa đã lưu'}</small></button>
          {issue.status!=='resolved'&&<button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{const evidence=window.prompt(`Căn cứ xác nhận “${issue.title}” đã sửa:`);if(!evidence?.trim())return;
            await updateStudentIssue({studentId:studentId!,issueId:issue.id,revision:issue.revision,status:'resolved',statusEvidence:evidence.trim()});await refresh()})}>Đã sửa</button>}
        </div>)}
        {issueDetail&&<div className="learning-detail"><b>Căn cứ theo thời gian</b>
          {issueDetail.occurrences.map((occurrence)=><div className="learning-occurrence" key={occurrence.id}><span>{new Date(occurrence.occurredAt).toLocaleString('vi-VN')} · {occurrence.sourceKind==='student_reported'?'học viên tự báo':occurrence.sourceKind==='teacher_confirmed'?'giáo viên xác nhận':'nhân viên xác nhận'} · {occurrence.approved?'đang tính':'đã loại'}</span>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{await updateStudentOccurrence({studentId:studentId!,issueId:issueDetail.issue.id,occurrenceId:occurrence.id,revision:occurrence.revision,approved:!Boolean(occurrence.approved)});await refresh()})}>{occurrence.approved?'Loại mốc':'Khôi phục mốc'}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{const title=window.prompt('Nhập tên lỗi đích. Lỗi có sẵn sẽ gộp; tên mới sẽ tách thành lỗi riêng.');if(!title?.trim())return;
              await updateStudentOccurrence({studentId:studentId!,issueId:issueDetail.issue.id,occurrenceId:occurrence.id,revision:occurrence.revision,targetIssueTitle:title.trim()});setIssueId(null);await refresh()})}>Gộp / tách</button>
          </div>)}
          {candidateMessages.length>0&&issueDetail.occurrences.length>0&&<div className="learning-add-evidence"><b>Gắn thêm tin vào mốc cũ, không tăng số lần xuất hiện</b>
            <select value={attachOccurrenceId} onChange={(event)=>setAttachOccurrenceId(event.target.value)}><option value="">Chọn mốc lỗi…</option>{issueDetail.occurrences.map((item)=><option key={item.id} value={item.id}>{new Date(item.occurredAt).toLocaleDateString('vi-VN')} · {item.sourceKind}</option>)}</select>
            <select value={attachMessageId} onChange={(event)=>setAdditionalEvidenceMessage(event.target.value)}><option value="">Chọn tin nguồn…</option>{candidateMessages.map((message)=><option key={message.id} value={message.id}>{message.sender==='student'?'Học viên':'Nhân viên'} · {message.text.slice(0,60)}</option>)}</select>
            <textarea value={attachQuote} onChange={(event)=>setAttachQuote(event.target.value)} placeholder="Trích nguyên văn, phải khớp với tin đã chọn" />
            <button type="button" className="btn btn-outline" disabled={busy||!attachOccurrenceId||!attachMessageId||!attachQuote.trim()} onClick={()=>run(async()=>{const occurrence=issueDetail.occurrences.find((item)=>item.id===attachOccurrenceId);if(!occurrence)return;
              const result=await updateStudentOccurrence({studentId:studentId!,issueId:issueDetail.issue.id,occurrenceId:occurrence.id,revision:occurrence.revision,
                evidenceConversationId:conversationId,evidenceMessageId:attachMessageId,evidenceText:attachQuote.trim()});setIssueDetail(result);setAttachOccurrenceId('');setAttachMessageId('');setAttachQuote('');await refresh()})}>Gắn bằng chứng</button>
          </div>}
          {issueDetail.evidence.map((item)=><blockquote key={item.id}><small>{item.speaker} · {new Date(item.occurredAt).toLocaleString('vi-VN')}</small><p>“{item.verbatimText}”</p>
          {(item.messageId||item.conversationId)&&<small>Nguồn: {item.conversationId||'hội thoại chưa rõ'} · tin {item.messageId||'chưa lưu ID'}</small>}</blockquote>)}
          {issueDetail.evidence.length===0&&<small>Thiếu bản tin nguyên văn nguồn.</small>}</div>}
        <details><summary>Ghi nhận một lần xuất hiện có căn cứ</summary><div className="learning-form"><input value={issueTitle} onChange={(event)=>setIssueTitle(event.target.value)} placeholder="Tên lỗi kỹ thuật" />
          <select value={sourceKind} onChange={(event)=>setSourceKind(event.target.value as typeof sourceKind)}><option value="teacher_confirmed">Giáo viên xác nhận</option><option value="student_reported">Học viên tự báo</option><option value="staff_confirmed">Nhân viên xác nhận</option></select>
          <select value={sourceMessage} onChange={(event)=>{setSourceMessage(event.target.value);setIssueQuote(candidateMessages.find((message)=>message.id===event.target.value)?.text||'')}}><option value="">Chọn tin nguồn…</option>{candidateMessages.map((message)=><option key={message.id} value={message.id}>{new Date(message.createdAt).toLocaleDateString('vi-VN')} · {message.text.slice(0,50)}</option>)}</select>
          <textarea value={issueQuote} onChange={(event)=>setIssueQuote(event.target.value)} placeholder="Trích nguyên văn bằng chứng" /><input value={practice} onChange={(event)=>setPractice(event.target.value)} placeholder="Cách sửa giáo viên đã dặn" />
          <button type="button" disabled={busy||!issueTitle.trim()||!issueQuote.trim()} onClick={()=>run(async()=>{const message=candidateMessages.find((item)=>item.id===sourceMessage);await createIssueOccurrence({studentId:studentId!,title:issueTitle.trim(),conversationId,
            messageId:message?.id,occurredAt:message?.createdAt||new Date().toISOString(),sourceKind,speaker:message?.sender==='student'?'Học viên':'Giáo viên/nhân viên',verbatimText:issueQuote.trim(),practiceAction:practice.trim()||undefined});
            setIssueTitle('');setIssueQuote('');setSourceMessage('');setPractice('');await refresh()})}>Lưu mốc lỗi</button></div></details>
      </section>
      <section className="learning-card"><h3>Đề xuất chờ duyệt ({proposals.length})</h3>{status&&<small>{status}</small>}
        {proposals.map((item)=><article className="learning-proposal" key={item.id}><b>{String(item.payload.title||item.payload.content||item.payload.summary||item.kind)}</b><small>{item.sourceText?`Nguồn: “${item.sourceText}”`:'Thiếu trích dẫn'} {item.confidence?`· ${Math.round(item.confidence*100)}%`:''}</small>
          <div><button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{const result=await decideStudentProposal({studentId:studentId!,proposalId:item.id,action:'accept'});setProposals(result.items);await refresh()})}>Duyệt</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>run(async()=>{const result=await decideStudentProposal({studentId:studentId!,proposalId:item.id,action:'reject'});setProposals(result.items)})}>Từ chối</button></div></article>)}
        {proposals.length===0&&<small>AI chỉ đề xuất; dữ kiện chưa duyệt không được dùng làm hồ sơ.</small>}
      </section>
    </>}
    {error&&<div className="inline-error" role="alert">{error}</div>}{busy&&<div className="inline-status">Đang lưu…</div>}
  </div>;
}
