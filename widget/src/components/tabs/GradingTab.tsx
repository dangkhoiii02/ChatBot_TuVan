import { useEffect, useRef, useState } from 'react';
import type { PronounPair, Suggestion } from '../../types';
import { getStudentIssues, type StudentIssueApi, type StudentSummaryApi } from '../../lib/api';
import { SuggestionCard } from '../SuggestionCard';

interface Props {
  pronouns: PronounPair;
  onUsePhrase: (text: string) => void;
  onCopy: (text: string) => void;
  onGenerate: (note: string, assignmentId: string, assignmentTitle: string, reviewSessionKey: string) => Promise<{ phrases: Suggestion[]; reviewSessionId?: string }>;
  conversationId: string | null;
  studentLinked: boolean;
  summary: StudentSummaryApi | null;
  onConfirmReview: (reviewSessionId: string) => Promise<void>;
}

export function GradingTab({ pronouns, onUsePhrase, onCopy, onGenerate, conversationId, studentLinked, summary, onConfirmReview }: Props) {
  const [note, setNote] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [phrases, setPhrases] = useState<Suggestion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [allIssues,setAllIssues]=useState<StudentIssueApi[]|null>(null);
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  // Results are tied to the pronoun pair sent to the backend; regenerate after a change.
  useEffect(() => {
    setPhrases(null);
    setSelectedId(null);
    setReviewSessionId(null);
    setConfirmed(false);
  }, [pronouns.listener, pronouns.speaker]);

  useEffect(()=>{
    if(!studentLinked||!summary?.studentId){setAllIssues(null);return;}
    let active=true;
    const load=async()=>{
      const rows:StudentIssueApi[]=[];
      for(let offset=0;;offset+=100){
        const page=await getStudentIssues(summary.studentId,offset);
        rows.push(...page.items);
        if(page.items.length<100)break;
      }
      if(active)setAllIssues(rows);
    };
    load().catch((value)=>{if(active)setError(value instanceof Error?value.message:'Không tải được danh sách lỗi.')});
    return()=>{active=false};
  },[studentLinked,summary?.studentId,summary?.revision]);

  const compose = async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('Hãy nhập nhận xét chuyên môn trước khi soạn cách nói.');
      return;
    }
    setLoading(true);
    setPhrases(null);
    setSelectedId(null);
    setReviewSessionId(null);
    setConfirmed(false);
    setError('');
    try {
      const fingerprint = `${conversationId || ''}\u0000${trimmed}\u0000${assignmentId || `new:${assignmentTitle.trim()}`}`;
      if (!keyRef.current || keyRef.current.fingerprint !== fingerprint) {
        keyRef.current = { fingerprint, key: globalThis.crypto?.randomUUID?.() || `review-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      }
      const result = await onGenerate(trimmed, assignmentId, assignmentId ? '' : assignmentTitle.trim(), keyRef.current.key);
      setPhrases(result.phrases);
      setReviewSessionId(result.reviewSessionId || null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tạo được nhận xét.');
    } finally {
      setLoading(false);
    }
  };

  const confirmReview = async () => {
    if (!reviewSessionId) return;
    setConfirming(true);
    setError('');
    try {
      await onConfirmReview(reviewSessionId);
      setConfirmed(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không xác nhận được lượt trả bài.');
    } finally {
      setConfirming(false);
    }
  };

  const referenceIssues = studentLinked ? (allIssues || summary?.issues || []) : [];
  const currentIssues = referenceIssues.filter((issue) => issue.status !== 'resolved');
  const recentIssues = [...referenceIssues].sort((a, b) => Date.parse(b.lastOccurredAt || '') - Date.parse(a.lastOccurredAt || '')).slice(0, 5);

  return (
    <div className="tab-panel grading-tab">
      <label className="field-block">
        <span className="field-label">Bài đang chấm (không bắt buộc)</span>
        <select className="text-input" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
          <option value="">Bài mới hoặc chưa chọn</option>
          {summary?.assignments.filter((assignment) => assignment.status === 'active').map((assignment) =>
            <option key={assignment.id} value={assignment.id}>{assignment.title} · {assignment.id.slice(-8)}</option>)}
        </select>
        {!assignmentId && <input className="text-input" value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} placeholder="Tên bài mới (để trống nếu chưa rõ)" />}
      </label>
      {studentLinked && <section className="grading-history-reference">
        <div className="field-label">Lỗi trước đây — chỉ để tham khảo, không tự đưa vào nhận xét hiện tại</div>
        {!referenceIssues.length ? <small>Chưa có lỗi kỹ thuật được lưu.</small> : <>
          <div><b>Chưa xác nhận đã sửa</b>{currentIssues.length ? currentIssues.map((issue) => <p key={issue.id}>• {issue.title} — {issue.latestPracticeAction || 'chưa có cách sửa đã lưu'} ({issue.occurrenceCount} lần)</p>) : <small>Không có lỗi đang theo dõi.</small>}</div>
          <details><summary>Gần đây</summary>{recentIssues.map((issue) => <p key={issue.id}>{issue.title} · {issue.status} · {issue.lastOccurredAt ? new Date(issue.lastOccurredAt).toLocaleDateString('vi-VN') : 'mốc chưa rõ'} · {issue.latestPracticeAction || 'chưa có cách sửa đã lưu'}</p>)}</details>
          <details><summary>Tất cả lỗi ({referenceIssues.length})</summary>{referenceIssues.map((issue) => <p key={issue.id}>{issue.title} · {issue.status} · {issue.lastOccurredAt ? new Date(issue.lastOccurredAt).toLocaleDateString('vi-VN') : 'mốc chưa rõ'} · {issue.latestPracticeAction || 'chưa có cách sửa đã lưu'}</p>)}</details>
        </>}
        <small>Chỉ nội dung nhập ở ô nhận xét bên dưới được dùng để xác định lỗi của bài hiện tại.</small>
      </section>}
      <label className="field-block">
        <span className="field-label">Nhận xét của thầy (AI chưa xem video)</span>
        <textarea
          className="textarea"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Sai nhịp đoạn điệp khúc"
        />
      </label>
      <button type="button" className="btn btn-outline" disabled={loading} onClick={compose}>
        {loading ? 'Đang soạn…' : 'Soạn cách nói'}
      </button>
      {error && <div className="inline-error" role="alert">{error}</div>}

      {loading && <div className="empty-state">AI đang soạn 3 cách nói…</div>}

      {!loading && phrases && (
        <>
        <div className="suggestion-list">
          {phrases.map((sg, i) => (
            <SuggestionCard
              key={sg.id}
              suggestion={sg}
              index={i + 1}
              selected={selectedId === sg.id}
              onSelect={() => {
                setSelectedId(sg.id);
                onUsePhrase(sg.text);
              }}
              onCopy={() => onCopy(sg.text)}
            />
          ))}
        </div>
        {reviewSessionId && <div className="review-session-confirmation">
          {confirmed ? <span>Đã ghi nhận lượt trả bài.</span> : <button type="button" className="btn btn-secondary" disabled={confirming} onClick={() => void confirmReview()}>{confirming ? 'Đang ghi nhận…' : 'Đã gửi nhận xét cho học viên'}</button>}
          <small>Việc soạn câu trả lời không tự tăng số lượt trả bài; chỉ ghi nhận khi xác nhận đã gửi.</small>
        </div>}
        </>
      )}

      {!loading && !phrases && (
        <div className="empty-state">
          Nhập nhận xét của giáo viên rồi bấm “Soạn cách nói”. AI không tự xem video.
        </div>
      )}
    </div>
  );
}
