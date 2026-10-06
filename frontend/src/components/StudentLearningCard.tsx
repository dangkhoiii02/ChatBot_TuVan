import { HelpTip } from './HelpTip';
import { SearchSelect } from './SearchSelect';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, IssueDetail, StudentFact, StudentIdentity, StudentIssue, StudentOption, StudentProposal, StudentReviewSession, StudentSummary } from '../types';
import {
  ApiError, confirmReviewSession, createIssueOccurrence, createStudentAssignment, createStudentFact, decideStudentProposal,
  extractStudentProposals, getConversationMessageStudents, getStudentIssueDetail, getStudentIssues, linkConversationMessages,
  listStudentFacts, listStudentProposals, listStudentReviews, recordStudentSubmission, updateStudentAssignment, updateStudentFact,
  updateStudentIssue, updateStudentOccurrence, updateStudentSubmission, type ConversationMessageStudentLink
} from '../services/api';
import { LearningDialog } from './LearningDialog';

type Props = {
  identity: StudentIdentity | null; students: StudentOption[]; summary: StudentSummary | null;
  conversationId: string; messages: ChatMessage[]; mode?: 'profile' | 'memories'; loading?: boolean;
  onLink: (input: { studentId?: string; newStudentName?: string; importLegacyContext?: boolean }) => Promise<void>;
  onOpenEvidence?: (conversationId: string, messageId?: string) => void;
  onRefresh: () => Promise<unknown>; onSyncHistory: () => Promise<unknown>;
  onStartReview?: (assignmentId?: string, sourceMessageId?: string) => void;
  onManageAttributes?: () => void;
};
type Form = 'identity' | 'fact' | 'assignment' | 'occurrence' | 'submission' | 'evidence' | 'proposal' | 'issue';
type Assignment = StudentSummary['assignments'][number];
type Action = { title: string; description: string; label: string; submitLabel: string; submit: (value: string) => Promise<unknown> };
const factLabels = { preference: 'Yêu cầu / xưng hô', event: 'Sự kiện', learning_note: 'Lưu ý cách học' };
const proposalLabels: Record<string, string> = { ...factLabels, issue: 'Lỗi kỹ thuật', practice_action: 'Cách sửa', resolution: 'Xác nhận đã sửa' };
const issueLabels = { active: 'Đang gặp', needs_verification: 'Chưa xác nhận đã sửa', resolved: 'Đã sửa', recurred: 'Tái phát' };
const sourceLabel = (kind: string) => kind === 'teacher_confirmed' ? 'Giáo viên xác nhận' : kind === 'student_reported' ? 'Học viên tự báo' : 'Nhân viên xác nhận';
const dateLabel = (value?: string | null, time = false) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Chưa rõ';
  return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });
};
const dateInput = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
const messageLabel = (message: ChatMessage) => `${dateLabel(message.createdAt || message.sentAt)} · ${message.senderName || (message.sender === 'student' ? 'Học viên' : 'Nhân viên')} · ${message.text.slice(0, 70)}`;

export function StudentLearningCard({ identity, students, summary, conversationId, messages, mode = 'profile', loading,
  onLink, onOpenEvidence, onRefresh, onSyncHistory, onStartReview, onManageAttributes }: Props) {
  const linkedId = identity?.student?.id;
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [actionText, setActionText] = useState('');
  const [studentId, setStudentId] = useState('');
  const [newName, setNewName] = useState(identity?.customerName || '');
  const [linkMode, setLinkMode] = useState<'existing' | 'new'>(students.length ? 'existing' : 'new');
  const [importLegacy, setImportLegacy] = useState(false);
  const [section, setSection] = useState<'assignments' | 'issues' | 'proposals'>('assignments');
  const [assignmentFilter, setAssignmentFilter] = useState<'active' | 'completed'>('active');
  const [view, setView] = useState<'all' | 'recent' | 'unresolved'>('unresolved');
  const [factFilter, setFactFilter] = useState<'active' | 'expired' | 'archived'>('active');
  const [allIssues, setAllIssues] = useState<StudentIssue[] | null>(null);
  const [facts, setFacts] = useState<StudentFact[] | null>(null);
  const [reviews, setReviews] = useState<StudentReviewSession[]>([]);
  const [proposals, setProposals] = useState<StudentProposal[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [messageLinks, setMessageLinks] = useState<ConversationMessageStudentLink[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageStudentSelections, setMessageStudentSelections] = useState<Record<string, string>>({});
  const [editFact, setEditFact] = useState<StudentFact | null>(null);
  const [factKind, setFactKind] = useState<StudentFact['kind']>('preference');
  const [factText, setFactText] = useState('');
  const [factExpiry, setFactExpiry] = useState('');
  const [factUse, setFactUse] = useState(true);
  const [factPrivate, setFactPrivate] = useState(false);
  const [factSourceMessageId, setFactSourceMessageId] = useState('');
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentStart, setAssignmentStart] = useState('');
  const [assignmentSource, setAssignmentSource] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueSummary, setIssueSummary] = useState('');
  const [issueEvidenceId, setIssueEvidenceId] = useState('');
  const [issueEvidence, setIssueEvidence] = useState('');
  const [issuePractice, setIssuePractice] = useState('');
  const [issueAssignmentId, setIssueAssignmentId] = useState('');
  const [issueSource, setIssueSource] = useState<'teacher_confirmed' | 'student_reported' | 'staff_confirmed'>('staff_confirmed');
  const [attachOccurrenceId, setAttachOccurrenceId] = useState('');
  const [attachMessageId, setAttachMessageId] = useState('');
  const [attachQuote, setAttachQuote] = useState('');
  const [submissionMessageId, setSubmissionMessageId] = useState('');
  const [submissionAssignment, setSubmissionAssignment] = useState('');
  const [editProposal, setEditProposal] = useState<StudentProposal | null>(null);
  const [proposalContent, setProposalContent] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');

  const candidateMessages = useMemo(() => messages.filter((message) => message.id && message.text.trim() && message.sender !== 'system')
    .slice().sort((a, b) => Date.parse(b.createdAt || b.sentAt) - Date.parse(a.createdAt || a.sentAt)), [messages]);
  const studentMessages = candidateMessages.filter((message) => {
    const owner = messageLinks.find((link) => link.messageId === message.id);
    return owner?.studentId === linkedId;
  });
  const studentTextMessages = studentMessages.filter((message) => (message.sourceText ?? message.text).trim());
  const sourceIssues = allIssues || summary?.issues || [];
  const issues = useMemo(() => {
    const filtered = view === 'unresolved' ? sourceIssues.filter((issue) => issue.status !== 'resolved') : sourceIssues;
    return view === 'recent' ? [...filtered].sort((a, b) => Date.parse(b.lastOccurredAt || '') - Date.parse(a.lastOccurredAt || '')) : filtered;
  }, [sourceIssues, view]);
  const activeAssignments = summary?.assignments.filter((assignment) => assignment.status !== 'completed') || [];
  const pendingSubmissions = summary?.submissions.filter((submission) => submission.status === 'pending') || [];
  const displayedAssignments = summary?.assignments.filter((assignment) => assignmentFilter === 'completed' ? assignment.status === 'completed' : assignment.status !== 'completed') || [];
  const openIssues = sourceIssues.filter((issue) => issue.status !== 'resolved');
  const activeFacts = (facts || summary?.facts || []).filter((fact) => fact.status !== 'archived' && (!fact.expiresAt || Date.parse(fact.expiresAt) > Date.now()));
  const displayedFacts = (facts || [...(summary?.facts || []), ...(summary?.expiredFacts || [])]).filter((fact) => {
    if (factFilter === 'archived') return fact.status === 'archived';
    if (fact.status === 'archived') return false;
    const expired = Boolean(fact.expiresAt && Date.parse(fact.expiresAt) <= Date.now());
    return factFilter === 'expired' ? expired : !expired;
  });
  const reportError=(value:unknown,fallback:string)=>{
    const message=value instanceof Error?value.message:fallback;
    const detail=value instanceof ApiError && value.requestId?`${message} (mã: ${value.requestId})`:message;
    setError(detail);
    window.dispatchEvent(new CustomEvent('ttd:feature-error',{detail}));
  };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!identity || !linkedId) return;
    let active = true;
    setMessagesLoading(true);
    const loadMessageOwners=async()=>{
      const rows:ConversationMessageStudentLink[]=[];
      for(let offset=0;offset<candidateMessages.length&&active;offset+=100) {
        const result=await getConversationMessageStudents(identity.conversationId,identity.pageId,undefined,candidateMessages.slice(offset,offset+100).map(message=>message.id));
        rows.push(...result.items);
      }
      return rows;
    };
    loadMessageOwners().then(rows=>{if(active)setMessageLinks(rows);})
      .catch((err) => { if (active) reportError(err, 'Không tải được học viên của tin nguồn.'); })
      .finally(() => { if(active)setMessagesLoading(false); });
    return () => { active = false; };
  }, [identity?.conversationId, identity?.pageId, linkedId, summary?.revision, candidateMessages]);
  useEffect(() => {
    if (!linkedId) return;
    let active = true;
    const load = async () => {
      const rows: StudentIssue[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await getStudentIssues(linkedId, offset);
        rows.push(...page.items);
        if (page.items.length < 100 || !active) break;
      }
      return rows;
    };
    Promise.all([load(), listStudentFacts(linkedId), listStudentProposals(linkedId), listStudentReviews(linkedId)])
      .then(([issues, factResult, proposalResult, reviewResult]) => {
        if (!active) return;
        setAllIssues(issues); setFacts(factResult.items); setProposals(proposalResult.items); setReviews(reviewResult.items);
      }).catch((err) => { if (active) reportError(err, 'Không tải được hồ sơ.'); });
    return () => { active = false; };
  }, [linkedId, summary?.revision]);
  useEffect(() => {
    setIssueDetail(null);
    if (!linkedId || !selectedIssue) return;
    let active = true;
    setDetailLoading(true);
    getStudentIssueDetail(linkedId, selectedIssue).then((result) => { if (active) setIssueDetail(result); })
      .catch((err) => { if (active) reportError(err, 'Không tải được căn cứ.'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [linkedId, selectedIssue, summary?.revision]);

  const run = async (label: string, task: () => Promise<unknown>, success?: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError(''); setNotice('');
    try {
      await task();
      if (mounted.current && success) setNotice(success);
    } catch (err) {
      if (!mounted.current) return;
      reportError(err, 'Không lưu được dữ liệu.');
      if (err instanceof ApiError && (err.status === 409 || err.code === 'REVISION_CONFLICT')) {
        await onRefresh().catch(() => {});
      }
    } finally {
      busyRef.current = false; if (mounted.current) setBusy('');
    }
  };
  const openForm = (next: Form) => { setError(''); setNotice(''); setForm(next); };
  const closeForm = () => { setForm(null); setAction(null); setError(''); };
  const ask = (next: Action) => { setAction(next); setActionText(''); setError(''); setNotice(''); };
  const refresh = async () => { await onRefresh(); };
  const submitLink = () => run('Đang liên kết hồ sơ…', async () => {
    await onLink({ studentId: linkMode === 'existing' ? studentId : undefined, newStudentName: linkMode === 'new' ? newName.trim() : undefined, importLegacyContext: importLegacy });
    closeForm();
  }, 'Đã liên kết đúng học viên.');
  const openFact = (fact?: StudentFact) => {
    setEditFact(fact || null); setFactKind(fact?.kind || 'preference'); setFactText(fact?.content || '');
    setFactExpiry(dateInput(fact?.expiresAt)); setFactUse(Boolean(fact?.useRequested ?? fact?.useInSuggestions ?? true));
    setFactPrivate(fact?.sensitivity === 'private'); setFactSourceMessageId(''); openForm('fact');
  };
  const submitFact = () => run('Đang lưu ghi nhớ…', async () => {
    if (!linkedId) return;
    const input = { studentId: linkedId, kind: factKind, content: factText.trim(), useInSuggestions: factUse && !factPrivate,
      sensitivity: factPrivate ? 'private' as const : 'normal' as const,
      expiresAt: factExpiry ? new Date(`${factExpiry}T23:59:59+07:00`).toISOString() : null };
    if (editFact) await updateStudentFact({ ...input, factId: editFact.id });
    else {
      const source = studentMessages.find((message) => message.id === factSourceMessageId);
      await createStudentFact({ ...input, expiresAt: input.expiresAt || undefined, sourceText: source?.sourceText ?? source?.text, sourceMessageId: source?.id,
        sourceConversationId: source ? conversationId : undefined });
    }
    await refresh(); closeForm();
  }, 'Đã lưu ghi nhớ.');
  const openAssignment = (assignment?: Assignment) => {
    setEditAssignment(assignment || null); setAssignmentTitle(assignment?.title || ''); setAssignmentStart(dateInput(assignment?.startedAt));
    setAssignmentSource(assignment?.startedSource || ''); openForm('assignment');
  };
  const submitAssignment = () => run('Đang lưu bài tập…', async () => {
    if (!linkedId) return;
    const startedAt = assignmentStart ? new Date(`${assignmentStart}T12:00:00+07:00`).toISOString() : null;
    if (editAssignment) await updateStudentAssignment({ studentId: linkedId, assignmentId: editAssignment.id, revision: editAssignment.revision,
      title: assignmentTitle.trim(), startedAt, startedSource: startedAt ? assignmentSource.trim() : null });
    else await createStudentAssignment({ studentId: linkedId, title: assignmentTitle.trim(), startedAt: startedAt || undefined,
      startedSource: startedAt ? assignmentSource.trim() : undefined });
    await refresh(); closeForm();
  }, 'Đã lưu bài tập.');
  const openOccurrence = (issue?: StudentIssue) => {
    setIssueTitle(issue?.title || ''); setIssueSummary(''); setIssueEvidenceId(''); setIssueEvidence(''); setIssuePractice('');
    setIssueAssignmentId(''); setIssueSource('staff_confirmed'); openForm('occurrence');
  };
  const selectIssueMessage = (messageId: string) => {
    const message = studentMessages.find((item) => item.id === messageId);
    setIssueEvidenceId(messageId); setIssueEvidence(message?.sourceText ?? message?.text ?? ''); setIssuePractice('');
    setIssueSource(message?.sender === 'student' ? 'student_reported' : 'staff_confirmed');
  };
  const submitOccurrence = () => run('Đang ghi nhận lỗi…', async () => {
    if (!linkedId) return;
    const source = studentMessages.find((message) => message.id === issueEvidenceId);
    if (!source) throw new Error('Hãy chọn tin nguồn của học viên này.');
    await createIssueOccurrence({ studentId: linkedId, title: issueTitle.trim(), summary: issueSummary.trim() || undefined,
      assignmentId: issueAssignmentId || undefined, occurredAt: source.createdAt || source.sentAt, sourceKind: issueSource,
      conversationId, messageId: source.id, speaker: source.senderName || (source.sender === 'student' ? 'Học viên' : 'Giáo viên/nhân viên'),
      verbatimText: issueEvidence.trim(), practiceAction: issueSource === 'teacher_confirmed' ? issuePractice.trim() || undefined : undefined });
    await refresh(); closeForm();
  }, 'Đã ghi nhận lần xuất hiện có nguồn.');
  const submitSubmission = () => run('Đang ghi nhận bài nộp…', async () => {
    if (!linkedId) return;
    await recordStudentSubmission({ studentId: linkedId, conversationId, messageId: submissionMessageId, assignmentId: submissionAssignment.startsWith('new:') ? undefined : submissionAssignment || undefined, assignmentTitle: submissionAssignment.startsWith('new:') ? submissionAssignment.slice(4) : undefined });
    await refresh(); closeForm();
  }, 'Đã ghi nhận bài nộp, đang chờ nhận xét.');
  const extract = () => run('AI đang đọc tin mới…', async () => {
    if (!linkedId) return;
    const result = await extractStudentProposals({ studentId: linkedId, conversationId });
    setProposals(result.items);
    setNotice(`Đã đọc ${result.sourceMessageCount} tin, tạo ${result.createdCount} đề xuất.${result.hasMore ? ' Còn tin chưa xử lý; bạn có thể đọc tiếp.' : ''}`);
    if (mode === 'profile') setSection('proposals');
  });
  const decide = (proposalId: string, decision: 'accept' | 'reject', edits?: { content: string; title?: string }) => run('Đang xử lý đề xuất…', async () => {
    if (!linkedId) return;
    const result = await decideStudentProposal({ studentId: linkedId, proposalId, action: decision, ...edits });
    setProposals(result.items); await refresh(); closeForm();
  }, decision === 'accept' ? 'Đã duyệt và lưu vào hồ sơ.' : 'Đã từ chối đề xuất.');
  const archiveFact = (fact: StudentFact) => run('Đang cập nhật ghi nhớ…', async () => {
    if (!linkedId) return;
    const result = await updateStudentFact({ studentId: linkedId, factId: fact.id, status: fact.status === 'archived' ? 'active' : 'archived' });
    setFacts(result.items); await refresh();
  }, fact.status === 'archived' ? 'Đã khôi phục. Kiểm tra ngày hiệu lực trước khi dùng.' : 'Đã lưu trữ. Có thể khôi phục tại mục Lưu trữ.');
  const markIssue = (issue: StudentIssue) => ask({ title: `Xác nhận đã sửa: ${issue.title}`, description: 'Chỉ xác nhận khi giáo viên đã kết luận hoặc có căn cứ rõ ràng.',
    label: 'Căn cứ xác nhận', submitLabel: 'Xác nhận đã sửa', submit: async (evidence) => {
      await updateStudentIssue({ studentId: linkedId!, issueId: issue.id, revision: issue.revision, status: 'resolved', statusEvidence: evidence }); await refresh();
    } });
  const completeAssignment = (assignment: Assignment) => ask({ title: `Hoàn thành: ${assignment.title}`, description: 'Ghi nhận kết luận của giáo viên để kết thúc theo dõi bài này.',
    label: 'Căn cứ đã vượt bài', submitLabel: 'Xác nhận hoàn thành', submit: async (evidence) => {
      await updateStudentAssignment({ studentId: linkedId!, assignmentId: assignment.id, revision: assignment.revision, status: 'completed', completionEvidence: evidence }); await refresh();
    } });
  const loadMoreEvidence = () => run('Đang tải mốc cũ hơn…', async () => {
    if (!linkedId || !selectedIssue || !issueDetail) return;
    const result = await getStudentIssueDetail(linkedId, selectedIssue, issueDetail.occurrences.length);
    setIssueDetail({ ...result, occurrences: [...issueDetail.occurrences, ...result.occurrences], evidence: [...issueDetail.evidence, ...result.evidence] });
  });
  const assignMessage = (message: ChatMessage) => {
    if (!identity) return;
    const selected = messageStudentSelections[message.id];
    if (!selected) return;
    const current = messageLinks.find((link) => link.messageId === message.id);
    const apply = async () => {
      const result = await linkConversationMessages({ conversationId, pageId: identity.pageId, studentId: selected, messageIds: [message.id], reassign: Boolean(current && current.studentId !== selected) });
      setMessageLinks(result); await refresh();
    };
    if (current?.studentId && current.studentId !== selected) ask({ title: 'Chuyển học viên của tin nguồn', description: `Tin này đang thuộc ${current.studentName}. Người trực cần xác nhận đúng người trước khi chuyển.`,
      label: 'Lý do chuyển', submitLabel: 'Chuyển tin', submit: apply });
    else void run('Đang gắn học viên…', apply, 'Đã gắn tin nguồn đúng học viên.');
  };
  const buttons = (label: string, disabled = false) => <div className="learning-form-actions">
    <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={closeForm}>Hủy</button>
    <button type="submit" className="btn-primary-small" disabled={Boolean(busy) || disabled}>{busy || label}</button>
  </div>;
  const messageOptions = (rows = studentTextMessages) => messagesLoading ? <option value="" disabled>Đang xác định học viên của tin nguồn…</option>
    : rows.map((message) => <option key={message.id} value={message.id}>{messageLabel(message)}</option>);
  const sourceLink = (sourceConversationId?: string | null, messageId?: string | null) => sourceConversationId && onOpenEvidence &&
    <button type="button" className="learning-text-button" onClick={() => onOpenEvidence(sourceConversationId, messageId || undefined)}>Xem tin nguồn ↗</button>;
  const renderLink = () => <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void submitLink(); }}>
    <label>Học viên<SearchSelect value={linkMode === 'new' ? `new:${newName}` : studentId}
      onChange={(event) => { if (event.target.value.startsWith('new:')) { setLinkMode('new'); setNewName(event.target.value.slice(4)); setStudentId(''); } else { setLinkMode('existing'); setStudentId(event.target.value); } }}
      onCreate={(name) => { setNewName(name); setStudentId(''); setLinkMode('new'); }} createLabel="Tạo học viên">
      <option value="">Tìm hoặc thêm học viên…</option>
      {students.filter(student => form === 'identity' || identity?.relatedStudents.some(related => related.id === student.id)).map((student) => <option key={student.id} value={student.id}>{student.name} · {student.id.slice(-6)}</option>)}
      {linkMode === 'new' && newName.trim() && <option value={`new:${newName}`}>Học viên mới: {newName}</option>}
    </SearchSelect></label>
    <p className="learning-muted">Gõ tên để tìm. Nếu chưa có hồ sơ, chọn “Tạo học viên” rồi xác nhận bên dưới.</p>
    {identity?.legacyContextAvailable && <label className="learning-checkbox"><input type="checkbox" checked={importLegacy} onChange={(event) => setImportLegacy(event.target.checked)} />Sao chép ghi chú cũ của tài khoản vào hồ sơ này</label>}
    <p className="learning-muted">Các học viên dùng chung tài khoản vẫn có hồ sơ riêng. Chọn đúng người trước khi lưu bài tập, lỗi hoặc ghi nhớ.</p>
    <button type="submit" className="btn-primary-small" disabled={Boolean(busy) || (linkMode === 'existing' ? !studentId : !newName.trim())}>{busy || (linkMode === 'existing' ? 'Liên kết học viên' : 'Tạo và liên kết hồ sơ')}</button>
  </form>;
  const renderProposals = () => <div className="learning-proposal-list">
    <div className="learning-section-title"><div><h3>Đề xuất chờ duyệt <HelpTip title="Đề xuất AI">AI đọc tin đã đồng bộ và đề xuất thông tin kèm tin nguồn. Kiểm tra người nói và nguyên văn trước khi duyệt. Chỉ đề xuất được duyệt mới thành dữ liệu chính thức.</HelpTip></h3><p>AI đề xuất; bạn kiểm tra căn cứ trước khi lưu.</p></div>
      <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={extract}>Đọc tin mới</button></div>
    {proposals.length === 0 ? <div className="learning-empty"><b>Không có đề xuất đang chờ</b><p>Bấm “Đọc tin mới” để tìm dữ kiện có nguồn trong hội thoại.</p></div> : proposals.map((proposal) => <article className="learning-proposal" key={proposal.id}>
      <div className="learning-row"><span className="learning-tag">{proposalLabels[proposal.kind] || 'Dữ kiện'}</span><small>{dateLabel(proposal.createdAt)}</small></div>
      <h4>{String(proposal.payload.title || proposal.payload.issueTitle || proposal.payload.content || proposal.payload.summary || 'Đề xuất cập nhật')}</h4>
      {Boolean(proposal.payload.title && proposal.payload.summary) && <p>{String(proposal.payload.summary)}</p>}
      <blockquote>{proposal.sourceText || 'Thiếu trích dẫn nguồn.'}</blockquote>
      {sourceLink(proposal.sourceConversationId, proposal.sourceMessageId)}
      <div className="learning-button-row">
        <button type="button" className="btn-primary-small" disabled={Boolean(busy)} onClick={() => decide(proposal.id, 'accept')}>Duyệt</button>
        <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => {
          setEditProposal(proposal); setProposalTitle(String(proposal.payload.title || ''));
          setProposalContent(String(proposal.payload.content || proposal.payload.summary || proposal.payload.evidence || proposal.sourceText || '')); openForm('proposal');
        }}>Sửa rồi duyệt</button>
        <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => decide(proposal.id, 'reject')}>Từ chối</button>
      </div>
    </article>)}
  </div>;

  return <section className="student-learning-card learning-workspace" aria-label={mode === 'memories' ? 'Ghi nhớ có căn cứ' : 'Hồ sơ học tập và tiến độ trả bài'} aria-busy={Boolean(busy)}>
    {!form && !action && error && <div className="learning-error" role="alert">{error}<button type="button" className="learning-text-button" onClick={() => run('Đang tải lại…', refresh)}>Tải lại hồ sơ</button></div>}
    {notice && <div className="learning-notice" role="status">{notice}</div>}
    {loading && identity && !busy && <div className="learning-working" role="status">Đang cập nhật hồ sơ…</div>}
    {busy && <div className="learning-working" role="status"><span className="spinner-small" />{busy}</div>}
    {!identity ? <div className="learning-empty" role="status">{loading ? 'Đang tải hồ sơ học viên…' : 'Chưa tải được danh tính học viên.'}</div> : identity.status !== 'linked' ? <div className="learning-surface learning-link-card">
      <h3>Xác định người học trong đoạn chat</h3>
      <p>Đang trò chuyện với <b>{identity.customerName}</b>. Tài khoản này cần xác nhận người học một lần.</p>{renderLink()}
    </div> : <>
      {mode === 'profile' ? <>
        <div className="learning-profile-context"><span>Hồ sơ của người trong đoạn chat <HelpTip title="Hồ sơ hiện tại">Nội dung dưới đây thuộc học viên của đoạn chat đang mở. Ghi nhớ, bài tập và lỗi được lưu cho học viên này. Nếu tài khoản có nhiều người học, xem phần Cài đặt hồ sơ ở cuối.</HelpTip></span><div className="learning-profile-shortcuts"><button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => openFact()}>＋ Ghi chú</button>{onManageAttributes && <button type="button" className="learning-text-button" onClick={onManageAttributes}>＋ Thuộc tính</button>}</div></div>
        <nav className="learning-profile-nav" aria-label="Nội dung hồ sơ">
          <button type="button" aria-pressed={section === 'assignments'} onClick={() => setSection('assignments')}>Bài tập <span>{activeAssignments.length}</span></button>
          <button type="button" aria-pressed={section === 'issues'} onClick={() => setSection('issues')}>Theo dõi lỗi <span>{openIssues.length}</span></button>
          <button type="button" aria-pressed={section === 'proposals'} onClick={() => setSection('proposals')}>Đề xuất {proposals.length>0 && <span>{proposals.length}</span>}</button>
        </nav>
        {activeFacts.length > 0 && <details className="learning-brief-notes"><summary>Lưu ý khi trả lời ({activeFacts.length})</summary>{activeFacts.slice(0, 3).map((fact) => <p key={fact.id}>{fact.content}{fact.conflictStatus === 'pending' && <span className="learning-tag warning">Cần kiểm tra</span>}</p>)}</details>}
        {!summary && <div className="learning-empty">Chưa tải được tiến độ. <button type="button" className="learning-text-button" onClick={() => run('Đang tải hồ sơ…', refresh)}>Tải lại</button></div>}
        {summary && section === 'assignments' && <div className="learning-section-view">
          <div className="learning-section-title"><h3>{pendingSubmissions.length ? `Chờ nhận xét (${pendingSubmissions.length})` : 'Bài nộp'} <HelpTip title="Bài nộp">Chọn tin học viên gửi bài và gắn với bài đang học. Sau khi gửi nhận xét qua Pancake, xác nhận đã gửi để tính một lượt trả bài.</HelpTip></h3><button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => { setSubmissionAssignment(activeAssignments.length === 1 ? activeAssignments[0].id : ''); setSubmissionMessageId(studentMessages.find(message => message.sender === 'student')?.id || ''); openForm('submission'); }}>Ghi nhận bài nộp</button></div>
          {pendingSubmissions.map((submission) => <article className="learning-surface" key={submission.id}>
            <b>{submission.assignmentTitle || 'Bài nộp chưa chọn bài tập'}</b><p className="learning-muted">Nộp {dateLabel(submission.submittedAt, true)}</p>
            <div className="learning-button-row">{sourceLink(submission.conversationId, submission.sourceMessageId)}{submission.conversationId === conversationId && <button type="button" className="btn-secondary" onClick={() => onStartReview?.(submission.assignmentId || undefined, submission.sourceMessageId)}>Chấm bài</button>}
              <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => run('Đang bỏ qua bài nộp…', async () => { await updateStudentSubmission({ studentId: linkedId!, submissionId: submission.id, status: 'ignored' }); await refresh(); }, 'Đã bỏ qua bài nộp.')}>Bỏ qua</button></div>
          </article>)}

          <div className="learning-section-title"><div><h3>Bài đang học <HelpTip title="Bài đang học">Theo dõi từng bài hoặc đoạn nhạc. Bấm “Chấm bài này” để chọn sẵn bài. Số lượt chỉ tăng sau khi bạn xác nhận đã gửi nhận xét.</HelpTip></h3></div><button type="button" className="btn-primary-small" disabled={Boolean(busy)} onClick={() => openAssignment()}>Thêm bài</button></div>
          <div className="learning-segmented"><button type="button" aria-pressed={assignmentFilter === 'active'} onClick={() => setAssignmentFilter('active')}>Đang tập ({activeAssignments.length})</button><button type="button" aria-pressed={assignmentFilter === 'completed'} onClick={() => setAssignmentFilter('completed')}>Đã hoàn thành</button></div>
          {displayedAssignments.length === 0 && <div className="learning-empty"><b>{assignmentFilter === 'active' ? 'Chưa có bài đang tập' : 'Chưa có bài hoàn thành'}</b><p>Thêm tên bài; chỉ nhập ngày bắt đầu khi có căn cứ.</p></div>}
          {displayedAssignments.map((assignment) => <article className="learning-assignment-card" key={assignment.id}>
            <div className="learning-row"><h4>{assignment.title}</h4><span className={`learning-tag ${assignment.status === 'completed' ? 'success' : ''}`}>{assignment.status === 'completed' ? 'Đã hoàn thành' : assignment.status === 'unknown' ? 'Chưa rõ hiện trạng' : 'Đang tập'}</span></div>
            <p className="learning-assignment-summary">{assignment.startedAt && <span>{assignment.durationLabel} · </span>}{assignment.reviewSessionCount} lượt nhận xét đã gửi</p>
            <details className="learning-assignment-detail"><summary>Chi tiết tiến độ</summary>
            <p className="learning-muted">Nộp gần nhất: {dateLabel(assignment.lastSubmittedAt)} · Nhận xét gần nhất: {dateLabel(assignment.lastReviewedAt)}</p>
            {assignment.pendingSubmissionCount > 0 && <p className="learning-pending">{assignment.pendingSubmissionCount} bài nộp chờ nhận xét</p>}
            {assignment.unconfirmedReviewCount > 0 && <p className="learning-pending">{assignment.unconfirmedReviewCount} nhận xét chưa xác nhận đã gửi</p>}
            {assignment.completionEvidence && <p>Căn cứ hoàn thành: {assignment.completionEvidence}</p>}
            </details>
            <div className="learning-button-row">
              {assignment.status !== 'completed' && <button type="button" className="btn-primary-small" onClick={() => onStartReview?.(assignment.id)}>Chấm bài này</button>}
              <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => openAssignment(assignment)}>Chỉnh sửa</button>
              {assignment.status !== 'completed' && <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => completeAssignment(assignment)}>Đã vượt bài</button>}
              {assignment.status === 'completed' && <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => run('Đang mở lại bài…', async () => {
                await updateStudentAssignment({ studentId: linkedId!, assignmentId: assignment.id, revision: assignment.revision, status: 'active', completionEvidence: '' }); await refresh();
              }, 'Đã mở lại bài để tiếp tục theo dõi.')}>Mở lại bài</button>}
            </div>
          </article>)}
          <details className="learning-review-history"><summary>Lịch sử trả bài ({reviews.length})</summary>{reviews.length === 0 && <p className="learning-muted">Chưa có lượt trả bài.</p>}
            {reviews.map((review) => <article className="learning-surface" key={review.id}><div className="learning-row"><b>{review.assignmentTitle || 'Chưa chọn bài'}</b><span className={`learning-tag ${review.status === 'confirmed' ? 'success' : 'warning'}`}>{review.status === 'confirmed' ? 'Đã gửi' : 'Chưa xác nhận gửi'}</span></div>
              <p className="learning-muted">{dateLabel(review.reviewedAt, true)}</p><blockquote>{review.teacherInput}</blockquote>
              {sourceLink(review.conversationId, review.sourceMessageId)}
              {review.status === 'draft' && <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => run('Đang xác nhận lượt trả bài…', async () => { await confirmReviewSession({ studentId: linkedId!, reviewSessionId: review.id, confirmed: true, evidence: 'Nhân viên xác nhận đã gửi nhận xét.' }); await refresh(); }, 'Đã xác nhận lượt trả bài.')}>Đã gửi nhận xét</button>}
            </article>)}</details>
        </div>}
        {summary && section === 'issues' && <div className="learning-section-view">
          <div className="learning-section-title"><div><h3>Lỗi trước đây <HelpTip title="Lỗi kỹ thuật">Mỗi lỗi có ngày, người báo và tin làm căn cứ. Mở từng lỗi để xem nguyên văn và cách sửa gần nhất. Lỗi cũ chỉ để tham khảo khi chấm bài hiện tại.</HelpTip></h3><p>Cách sửa gần nhất và căn cứ của từng lần xuất hiện.</p></div><button type="button" className="btn-primary-small" disabled={Boolean(busy)} onClick={() => openOccurrence()}>Ghi nhận lỗi</button></div>
          <div className="learning-segmented" aria-label="Lọc lỗi kỹ thuật">{(['unresolved', 'recent', 'all'] as const).map((option) => <button type="button" key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option === 'all' ? 'Tất cả' : option === 'recent' ? 'Gần đây' : 'Cần theo dõi'}</button>)}</div>
          <p className="learning-muted">Lỗi cũ chỉ để tham khảo; không tự tính là lỗi của bài đang chấm.</p>
          {issues.length === 0 && <div className="learning-empty"><b>{view === 'unresolved' ? 'Không có lỗi đang cần theo dõi' : 'Chưa ghi nhận lỗi có căn cứ'}</b><p>Mỗi lỗi có lịch sử và cách sửa riêng.</p></div>}
          {issues.map((issue) => <article className={`learning-issue-card ${selectedIssue === issue.id ? 'is-open' : ''}`} key={issue.id}>
            <button type="button" className="learning-issue-trigger" aria-expanded={selectedIssue === issue.id} onClick={() => setSelectedIssue(selectedIssue === issue.id ? null : issue.id)}>
              <span className="learning-row"><h4>{issue.title}</h4><span className={`learning-tag status-${issue.status}`}>{issueLabels[issue.status]}</span></span>
              {issue.summary && <p>{issue.summary}</p>}
              <span className="learning-issue-counts"><span><b>{issue.occurrenceCount}</b> lần xuất hiện</span><span><b>{issue.reviewSessionCount}</b> lượt trả bài</span><span><b>{issue.messageMentionCount}</b> tin nguồn</span></span>
              <small>Gần nhất {dateLabel(issue.lastOccurredAt)}{issue.latestSourceKind ? ` · ${sourceLabel(issue.latestSourceKind)}` : ''}</small>
              <span className="learning-practice"><b>Cách sửa gần nhất</b>{issue.latestPracticeAction || 'Chưa có hướng dẫn đã lưu.'}</span>
              <span className="learning-detail-label">{selectedIssue === issue.id ? 'Thu gọn căn cứ ↑' : 'Xem dòng thời gian & nguyên văn ↓'}</span>
            </button>
            {selectedIssue === issue.id && <div className="learning-timeline">
              <div className="learning-button-row"><button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => openOccurrence(issue)}>Thêm lần xuất hiện</button>
                <button type="button" className="btn-secondary" onClick={() => { setIssueTitle(issue.title); setIssueSummary(issue.summary); openForm('issue'); }}>Sửa tóm tắt</button>
                {issue.status !== 'resolved' && <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => markIssue(issue)}>Xác nhận đã sửa</button>}</div>
              {detailLoading && <p role="status">Đang tải căn cứ…</p>}
              {issueDetail && issueDetail.occurrences.map((occurrence) => <div className={`learning-timeline-item ${occurrence.approved ? '' : 'excluded'}`} key={occurrence.id}>
                <div className="learning-row"><b>{dateLabel(occurrence.occurredAt, true)}</b><span className="learning-tag">{sourceLabel(occurrence.sourceKind)}</span></div>
                <p className="learning-muted">{occurrence.assignmentTitle || 'Chưa gắn bài tập'}{!occurrence.approved ? ' · Đã loại khỏi thống kê' : ''}</p>
                {issueDetail.evidence.filter((item) => item.occurrenceId === occurrence.id).map((item) => <div className="learning-source" key={item.id}>
                  <small>{item.speaker} · {dateLabel(item.occurredAt, true)}</small><blockquote>{item.verbatimText}</blockquote>{sourceLink(item.conversationId, item.messageId)}
                </div>)}
                {occurrence.evidenceCount === 0 && <p className="learning-muted">Thiếu bản nguyên văn nguồn.</p>}
                <details className="learning-occurrence-tools"><summary>Chỉnh mốc / thêm căn cứ</summary><div className="learning-button-row">
                  <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => { setAttachOccurrenceId(occurrence.id); setAttachMessageId(''); setAttachQuote(''); openForm('evidence'); }}>Gắn thêm tin</button>
                  <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => run('Đang cập nhật mốc…', async () => { await updateStudentOccurrence({ studentId: linkedId!, issueId: issue.id, occurrenceId: occurrence.id, revision: occurrence.revision, approved: !Boolean(occurrence.approved) }); await refresh(); }, 'Đã cập nhật mốc và thống kê.')}>{occurrence.approved ? 'Loại khỏi thống kê' : 'Khôi phục mốc'}</button>
                  <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => ask({ title: 'Gộp / tách lần xuất hiện', description: 'Nhập tên lỗi có sẵn để gộp mốc này; nhập tên lỗi mới để tách sang lỗi riêng.', label: 'Tên lỗi đích', submitLabel: 'Chuyển mốc', submit: async (title) => { await updateStudentOccurrence({ studentId: linkedId!, issueId: issue.id, occurrenceId: occurrence.id, revision: occurrence.revision, targetIssueTitle: title }); setSelectedIssue(null); await refresh(); } })}>Gộp / tách lỗi</button>
                </div></details>
              </div>)}
              {issueDetail?.hasMore && <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={loadMoreEvidence}>Xem mốc cũ hơn</button>}
              {issueDetail && issueDetail.practiceActions.length > 0 && <details><summary>Hướng dẫn giáo viên đã lưu ({issueDetail.practiceActions.length})</summary>{issueDetail.practiceActions.map((practice) => <div className="learning-source" key={practice.id}><small>{dateLabel(practice.createdAt, true)}</small><blockquote>{practice.content}</blockquote></div>)}</details>}
            </div>}
          </article>)}
        </div>}
        {summary && section === 'proposals' && renderProposals()}
        <details className="learning-profile-settings"><summary>Cài đặt hồ sơ & lịch sử</summary>
          <p className="learning-muted">Hồ sơ đang gắn với {identity.student?.name}. Các thay đổi bên trên chỉ lưu cho người này.</p>
          <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => { setStudentId(linkedId || ''); setLinkMode('existing'); openForm('identity'); }}>Điều chỉnh liên kết hồ sơ</button>
        <details className="learning-history"><summary><span className={`learning-coverage-dot ${summary?.historyCoverage.status || 'unknown'}`} />
          {summary?.historyCoverage.status === 'complete' ? 'Đã đồng bộ đầy đủ lịch sử đã liên kết' : summary?.historyCoverage.status === 'partial' ? 'Lịch sử một phần · số liệu có thể là “ít nhất”' : 'Chưa đồng bộ lịch sử'}
        </summary><p>Phạm vi từ {dateLabel(summary?.historyCoverage.oldestMessageAt)}. Cập nhật: {dateLabel(summary?.historyCoverage.lastSyncedAt, true)}.</p>
          {summary?.historyCoverage.errors.map((item, index) => <p className="learning-error" key={index}>{item}</p>)}
          <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => run('Đang đồng bộ lịch sử…', onSyncHistory, 'Đã cập nhật phạm vi lịch sử. Có thể đồng bộ tiếp nếu còn thiếu.')}>Đồng bộ thêm lịch sử</button>
        </details>
          {(identity.relatedStudents.length>1 || messageLinks.some(link => link.studentId && link.studentId!==linkedId)) && <>
        <details className="learning-message-identity"><summary>Tài khoản dùng chung: gắn tin cho từng học viên</summary><p className="learning-muted">Tin đã gắn vẫn thuộc học viên cũ khi đổi hồ sơ hội thoại. Chỉ chuyển khi có căn cứ đúng người.</p>
          {candidateMessages.map((message) => {
            const mapping = messageLinks.find((link) => link.messageId === message.id);
            const selected = messageStudentSelections[message.id] ?? mapping?.studentId ?? '';
            return <div className="learning-message-map" key={message.id}><small>{messageLabel(message)}</small><p>Đang thuộc: <b>{mapping?.studentName || identity.student?.name}</b></p>
              <div className="learning-button-row"><SearchSelect aria-label={`Học viên của tin: ${message.text.slice(0, 30)}`} value={selected} onChange={(event) => setMessageStudentSelections((current) => ({ ...current, [message.id]: event.target.value }))}><option value="">Chọn học viên…</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</SearchSelect>
                <button type="button" className="btn-secondary" disabled={Boolean(busy) || !selected || selected === mapping?.studentId} onClick={() => assignMessage(message)}>Gắn tin</button></div>
            </div>;
          })}
        </details>
          </>}
        </details>
      </> : <>
        <div className="learning-section-title"><div><h3>Ghi nhớ của {identity.student?.name} <HelpTip title="Ghi nhớ">Lưu yêu cầu xưng hô, sự kiện và lưu ý học tập của học viên này. Bạn quyết định ghi nhớ nào được AI dùng khi soạn gợi ý; dữ liệu riêng tư không dùng cho AI.</HelpTip></h3><p>Yêu cầu, sự kiện và lưu ý học tập có hiệu lực.</p></div><button type="button" className="btn-primary-small" disabled={Boolean(busy)} onClick={() => openFact()}>Thêm ghi nhớ</button></div>
        <div className="learning-segmented">{(['active', 'expired', 'archived'] as const).map((filter) => <button type="button" key={filter} aria-pressed={factFilter === filter} onClick={() => setFactFilter(filter)}>{filter === 'active' ? 'Hiện hành' : filter === 'expired' ? 'Hết hiệu lực' : 'Lưu trữ'}</button>)}</div>
        {displayedFacts.length === 0 && <div className="learning-empty"><b>Chưa có ghi nhớ trong mục này</b><p>Nhập thông tin đã xác nhận hoặc duyệt đề xuất từ tin nhắn.</p></div>}
        {displayedFacts.map((fact) => <article className="learning-fact-card" key={fact.id}>
          <div className="learning-row"><span className="learning-tag">{factLabels[fact.kind]}</span><span className={`learning-tag ${fact.sensitivity === 'private' ? '' : fact.useInSuggestions ? 'success' : ''}`}>{fact.sensitivity === 'private' ? 'Riêng tư · không dùng cho AI' : fact.status === 'archived' ? 'Đã lưu trữ · không dùng cho AI' : fact.expiresAt && Date.parse(fact.expiresAt)<=Date.now() ? 'Hết hiệu lực · không dùng cho AI' : fact.useInSuggestions ? 'Dùng cho AI' : 'Không dùng cho AI'}</span></div>
          <p>{fact.content}</p>{fact.expiresAt && <small>Hiệu lực đến {dateLabel(fact.expiresAt)}</small>}
          {fact.verificationStatus === 'legacy_unverified' && <p className="learning-pending">Ghi chú cũ chưa được xác nhận; AI chưa sử dụng.</p>}
          {fact.conflictStatus === 'pending' && <div className="learning-conflict"><b>Có yêu cầu mâu thuẫn</b><p>Chọn thông tin đúng để áp dụng; AI chưa dùng các yêu cầu đang mâu thuẫn.</p><button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => ask({ title: 'Chọn yêu cầu được áp dụng', description: fact.content, label: 'Căn cứ chọn yêu cầu này', submitLabel: 'Áp dụng yêu cầu này', submit: async () => { await updateStudentFact({ studentId: linkedId!, factId: fact.id, conflictResolution: 'use_this' }); await refresh(); } })}>Áp dụng yêu cầu này</button></div>}
          {fact.sourceText && <details className="learning-fact-source"><summary>Xem căn cứ</summary><blockquote>{fact.sourceText}</blockquote>{sourceLink(fact.sourceConversationId, fact.sourceMessageId)}</details>}
          <div className="learning-button-row"><button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => openFact(fact)}>Chỉnh sửa</button>
            {fact.verificationStatus === 'legacy_unverified' && <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => run('Đang xác nhận ghi nhớ…', async () => { await updateStudentFact({ studentId: linkedId!, factId: fact.id, verificationStatus: 'confirmed' }); await refresh(); }, 'Đã xác nhận ghi nhớ.')}>Xác nhận nội dung</button>}
            <button type="button" className="learning-text-button" disabled={Boolean(busy)} onClick={() => archiveFact(fact)}>{fact.status === 'archived' ? 'Khôi phục' : 'Lưu trữ'}</button></div>
        </article>)}
        <details className="learning-note-proposals"><summary>Đề xuất chờ duyệt ({proposals.length})</summary>{renderProposals()}</details>
      </>}
    </>}

    {(form || action) && <LearningDialog title={action?.title || ({ identity: 'Đổi / thêm học viên', fact: editFact ? 'Chỉnh sửa ghi nhớ' : 'Thêm ghi nhớ', assignment: editAssignment ? 'Chỉnh sửa bài tập' : 'Thêm bài đang tập', occurrence: 'Ghi nhận một lần gặp lỗi', submission: 'Ghi nhận bài nộp', evidence: 'Gắn thêm căn cứ vào mốc lỗi', proposal: 'Sửa đề xuất trước khi duyệt', issue: 'Chỉnh sửa tóm tắt lỗi' }[form!])}
      description={action?.description} busy={Boolean(busy)} error={error} onClose={closeForm}>
      {action ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void run('Đang xác nhận…', async () => { await action.submit(actionText.trim()); closeForm(); }, 'Đã cập nhật hồ sơ.'); }}>
        <label>{action.label}<textarea autoFocus required value={actionText} onChange={(event) => setActionText(event.target.value)} rows={3} maxLength={2000} /></label>{buttons(action.submitLabel, !actionText.trim())}
      </form> : form === 'identity' ? renderLink() : form === 'fact' ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void submitFact(); }}>
        <label><span className="learning-label-text">Loại ghi nhớ <HelpTip title="Loại ghi nhớ">Chọn yêu cầu, sự kiện hoặc lưu ý cách học. Đây là cách sắp xếp ghi nhớ để tìm và dùng đúng lúc.</HelpTip></span><SearchSelect value={factKind} onChange={(event) => setFactKind(event.target.value as StudentFact['kind'])}>{Object.entries(factLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</SearchSelect></label>
        <label>Nội dung đã xác nhận<textarea autoFocus required value={factText} onChange={(event) => setFactText(event.target.value)} rows={3} maxLength={5000} placeholder="Ví dụ: Muốn được gọi là Lan; thích hướng dẫn từng bước…" /></label>
        {!editFact && <label><span className="learning-label-text">Tin nguồn (tùy chọn) <HelpTip title="Tin nguồn (tùy chọn)">Nếu ghi nhớ xuất phát từ tin nhắn, chọn tin đó làm căn cứ. Nếu nhân viên đã xác nhận trực tiếp, để mặc định.</HelpTip></span><SearchSelect value={factSourceMessageId} onChange={(event) => setFactSourceMessageId(event.target.value)}><option value="">Nhân viên xác nhận trực tiếp</option>{messageOptions()}</SearchSelect></label>}
        <details className="learning-form-options"><summary>Hiệu lực & quyền dùng cho AI</summary><label>Ngày hết hiệu lực (tùy chọn)<input type="date" value={factExpiry} onChange={(event) => setFactExpiry(event.target.value)} /></label>
        <label className="learning-checkbox"><input type="checkbox" checked={factPrivate} onChange={(event) => setFactPrivate(event.target.checked)} />Thông tin riêng tư / nhạy cảm</label>
        <label className="learning-checkbox"><input type="checkbox" checked={factUse && !factPrivate} disabled={factPrivate} onChange={(event) => setFactUse(event.target.checked)} />Cho AI dùng khi soạn gợi ý phù hợp</label>
        <p className="learning-muted">Ghi nhớ riêng tư được lưu cho nhân viên và không đưa vào câu trả lời AI.</p></details>{buttons('Lưu ghi nhớ', !factText.trim())}
      </form> : form === 'assignment' ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void submitAssignment(); }}>
        <label>Tên bài / đoạn nhạc<input autoFocus required value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} maxLength={200} placeholder="Tên bài và đoạn đang tập" /></label>
        <label>Ngày bắt đầu có căn cứ (tùy chọn)<input type="date" value={assignmentStart} onChange={(event) => setAssignmentStart(event.target.value)} /></label>
        {assignmentStart && <label>Căn cứ cho ngày bắt đầu<textarea required value={assignmentSource} onChange={(event) => setAssignmentSource(event.target.value)} rows={2} maxLength={1000} placeholder="Ví dụ: Học viên báo đang vướng đoạn này trong tin ngày…" /></label>}
        <p className="learning-muted">Chưa rõ mốc bắt đầu thì để trống. Hai bài trùng tên vẫn được theo dõi riêng.</p>{buttons('Lưu bài tập', !assignmentTitle.trim() || Boolean(assignmentStart && !assignmentSource.trim()))}
      </form> : form === 'submission' ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void submitSubmission(); }}>
        <label><span className="learning-label-text">Tin học viên đã nộp bài <HelpTip title="Tin học viên đã nộp bài">Chọn đúng tin học viên gửi bài. Danh sách chỉ hiện tin của học viên trong đoạn chat.</HelpTip></span><SearchSelect autoFocus required value={submissionMessageId} onChange={(event) => setSubmissionMessageId(event.target.value)}><option value="">Chọn tin nộp bài…</option>{messageOptions(studentMessages.filter((message) => message.sender === 'student'))}</SearchSelect></label>
        <label><span className="learning-label-text">Bài đang tập <HelpTip title="Bài đang tập">Chọn bài đã có; nếu chưa có, gõ tên trong ô rồi bấm “Thêm bài”.</HelpTip></span><SearchSelect value={submissionAssignment} createLabel="Thêm bài" onCreate={(name) => setSubmissionAssignment(`new:${name}`)} onChange={(event) => setSubmissionAssignment(event.target.value)}><option value="">Chưa xác định bài</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title} · {assignment.id.slice(-6)}</option>)}{submissionAssignment.startsWith('new:') && <option value={submissionAssignment}>Bài mới: {submissionAssignment.slice(4)}</option>}</SearchSelect></label>
        <p className="learning-muted">Bài nộp được đánh dấu chờ nhận xét; chưa tăng số lượt trả bài.</p>{buttons('Ghi nhận bài nộp', !submissionMessageId)}
      </form> : form === 'occurrence' ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void submitOccurrence(); }}>
        <label>Tên lỗi kỹ thuật<input autoFocus required value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} list="existing-learning-issues" maxLength={200} placeholder="Ví dụ: Sai nhịp, cổ tay thấp…" /><datalist id="existing-learning-issues">{sourceIssues.map((issue) => <option key={issue.id} value={issue.title} />)}</datalist></label>
        <label><span className="learning-label-text">Tin nguồn của lần tập / nộp bài <HelpTip title="Tin nguồn của lần tập / nộp bài">Chọn tin cho thấy lỗi xuất hiện ở lần tập này. Trích dẫn phải đúng nguyên văn tin nguồn.</HelpTip></span><SearchSelect required value={issueEvidenceId} onChange={(event) => selectIssueMessage(event.target.value)}><option value="">Chọn tin có căn cứ…</option>{messageOptions()}</SearchSelect></label>
        <label>Trích nguyên văn<textarea required value={issueEvidence} onChange={(event) => setIssueEvidence(event.target.value)} rows={3} maxLength={5000} /></label>
        <label><span className="learning-label-text">Nguồn xác nhận <HelpTip title="Nguồn xác nhận">Chọn người xác nhận lỗi. Học viên tự báo được ghi riêng với giáo viên xác nhận.</HelpTip></span><SearchSelect value={issueSource} onChange={(event) => { setIssueSource(event.target.value as typeof issueSource); setIssuePractice(''); }}>
          <option value="staff_confirmed">Nhân viên xác nhận</option>{studentMessages.find((message) => message.id === issueEvidenceId)?.sender === 'student' ? <option value="student_reported">Học viên tự báo — chưa phải kết luận giáo viên</option> : <option value="teacher_confirmed">Giáo viên đã xác nhận</option>}
        </SearchSelect></label>
        <label><span className="learning-label-text">Bài liên quan (tùy chọn) <HelpTip title="Bài liên quan (tùy chọn)">Gắn lỗi với bài đang tập để xem tiến độ theo bài. Để trống nếu lỗi chưa thuộc bài cụ thể.</HelpTip></span><SearchSelect value={issueAssignmentId} onChange={(event) => setIssueAssignmentId(event.target.value)}><option value="">Chưa chọn bài</option>{summary?.assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title} · {assignment.id.slice(-6)}</option>)}</SearchSelect></label>
        {issueSource === 'teacher_confirmed' && <label>Cách sửa giáo viên đã dặn (tùy chọn)<textarea value={issuePractice} onChange={(event) => setIssuePractice(event.target.value)} rows={2} placeholder="Trích đúng phần hướng dẫn trong tin nguồn" /></label>}
        <details><summary>Thêm tóm tắt ngắn</summary><label>Tóm tắt<input value={issueSummary} onChange={(event) => setIssueSummary(event.target.value)} maxLength={2000} /></label></details>
        <p className="learning-muted">Một lần tập có thể có nhiều tin căn cứ. Dùng “Gắn thêm tin” trong dòng thời gian để tránh tăng số lần mắc.</p>{buttons('Lưu lần xuất hiện', !issueTitle.trim() || !issueEvidenceId || !issueEvidence.trim())}
      </form> : form === 'evidence' ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void run('Đang gắn căn cứ…', async () => {
        const occurrence = issueDetail?.occurrences.find((item) => item.id === attachOccurrenceId); if (!occurrence || !selectedIssue) return;
        await updateStudentOccurrence({ studentId: linkedId!, issueId: selectedIssue, occurrenceId: occurrence.id, revision: occurrence.revision,
          evidenceConversationId: conversationId, evidenceMessageId: attachMessageId, evidenceText: attachQuote.trim() }); await refresh(); closeForm();
      }, 'Đã gắn thêm căn cứ, không tăng số lần xuất hiện.'); }}>
        <p className="learning-muted">Thêm tin cho mốc {dateLabel(issueDetail?.occurrences.find((item) => item.id === attachOccurrenceId)?.occurredAt, true)}.</p>
        <label>Tin nguồn<SearchSelect autoFocus required value={attachMessageId} onChange={(event) => { setAttachMessageId(event.target.value); const source = studentTextMessages.find((message) => message.id === event.target.value); setAttachQuote(source?.sourceText ?? source?.text ?? ''); }}><option value="">Chọn tin…</option>{messageOptions()}</SearchSelect></label>
        <label>Trích nguyên văn<textarea required value={attachQuote} onChange={(event) => setAttachQuote(event.target.value)} rows={3} /></label>{buttons('Gắn thêm căn cứ', !attachMessageId || !attachQuote.trim())}
      </form> : form === 'proposal' && editProposal ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void decide(editProposal.id, 'accept', { content: proposalContent.trim(), title: proposalTitle.trim() || undefined }); }}>
        {editProposal.kind === 'issue' && <label>Tên lỗi<input required value={proposalTitle} onChange={(event) => setProposalTitle(event.target.value)} maxLength={200} /></label>}
        <label>Nội dung để lưu<textarea autoFocus required value={proposalContent} onChange={(event) => setProposalContent(event.target.value)} rows={4} maxLength={5000} /></label><blockquote>{editProposal.sourceText || 'Thiếu trích dẫn nguồn.'}</blockquote>{buttons('Duyệt và lưu', !proposalContent.trim() || (editProposal.kind === 'issue' && !proposalTitle.trim()))}
      </form> : form === 'issue' ? <form className="learning-form" onSubmit={(event) => { event.preventDefault(); void run('Đang sửa tóm tắt…', async () => {
        const issue = sourceIssues.find((item) => item.id === selectedIssue); if (!issue) return;
        await updateStudentIssue({ studentId: linkedId!, issueId: issue.id, revision: issue.revision, title: issueTitle.trim(), summary: issueSummary.trim() }); await refresh(); closeForm();
      }, 'Đã cập nhật tóm tắt lỗi.'); }}><label>Tên lỗi<input autoFocus required value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} maxLength={200} /></label><label>Tóm tắt<textarea value={issueSummary} onChange={(event) => setIssueSummary(event.target.value)} rows={3} maxLength={2000} /></label>{buttons('Lưu tóm tắt', !issueTitle.trim())}</form> : null}
    </LearningDialog>}
  </section>;
}
