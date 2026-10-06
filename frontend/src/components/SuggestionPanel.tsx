import { HelpTip } from './HelpTip';
import { SearchSelect } from './SearchSelect';
import React, { useEffect, useRef, useState } from 'react';
import { Conversation, Suggestion, PronounPair, CustomField, ProfileField, MemoryItem, StudentIdentity, StudentOption, StudentSummary } from '../types';
import { StudentLearningCard } from './StudentLearningCard';

export interface SuggestionPanelProps {
  conversation?: Conversation;
  suggestions: Suggestion[];
  isGenerating: boolean;
  onGenerate: () => void;
  onUseSuggestion: (content: string) => void;
  currentPronoun: PronounPair;
  onChangePronouns: (pair: PronounPair) => void;
  onGradeAssignment: (reviewText: string, assignmentId?:string, assignmentTitle?:string, reviewSessionKey?:string, sourceMessageId?:string) => Promise<string|void> | string | void;
  onAddCustomField: (field: Omit<CustomField, 'id' | 'source'>) => Promise<void> | void;
  onUpdateCustomField?: (id: string, changes: { value?: string; addOption?: string; useInSuggestions?: boolean; hidden?: boolean }) => Promise<void> | void;
  onDeleteCustomField?: (id: string) => Promise<void> | void;
  onAcceptAiProfileSuggestion: (fieldKey: string, newValue: string) => void;
  onSaveMemory: (content: string, reason?: string) => Promise<void> | void;
  onDeleteMemory?: (id: string) => void;
  onMemoryAction?: (id: string, action: 'activate' | 'archive' | 'restore') => void;
  onCloseMobile?: () => void;
  aiApiKey?: string;
  isContextLoading?: boolean;
  isSavingContext?: boolean;
  studentIdentity?: StudentIdentity | null;
  studentOptions?: StudentOption[];
  studentSummary?: StudentSummary | null;
  onLinkStudent?: (input:{studentId?:string;newStudentName?:string;importLegacyContext?:boolean})=>Promise<void>;
  onRefreshStudentSummary?: ()=>Promise<unknown>;
  onConfirmReviewSession?: (reviewSessionId:string)=>Promise<void>;
  onSyncConversationHistory?: ()=>Promise<unknown>;
  onOpenEvidence?:(conversationId:string,messageId?:string)=>void;
}

type AssistantTab = 'suggestions' | 'profile' | 'grading' | 'memories';

const COMMON_PRONOUNS: PronounPair[] = [
  { recipientCall: 'Em', senderCall: 'Thầy', label: 'Thầy — Em' },
  { recipientCall: 'Chị', senderCall: 'Em', label: 'Em — Chị' },
  { recipientCall: 'Chị', senderCall: 'Thầy', label: 'Thầy — Chị' },
  { recipientCall: 'Anh', senderCall: 'Thầy', label: 'Thầy — Anh' },
  { recipientCall: 'Anh', senderCall: 'Em', label: 'Em — Anh' },
  { recipientCall: 'Bạn', senderCall: 'Thầy', label: 'Thầy — Bạn' }
];

export const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
  conversation,
  suggestions,
  isGenerating,
  onGenerate,
  onUseSuggestion,
  currentPronoun,
  onChangePronouns,
  onGradeAssignment,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onAcceptAiProfileSuggestion,
  onDeleteMemory,
  onMemoryAction,
  onCloseMobile,
  isContextLoading,
  isSavingContext,
  studentIdentity,
  studentOptions=[] ,
  studentSummary,
  onLinkStudent,
  onRefreshStudentSummary,
  onConfirmReviewSession,
  onSyncConversationHistory,
  onOpenEvidence,
}) => {
  const [attributesOpen, setAttributesOpen] = useState(false);
  const attributesRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<AssistantTab>('suggestions');
  const [isPronounMenuOpen, setIsPronounMenuOpen] = useState(false);
  const [gradingInput, setGradingInput] = useState('');
  const [assignmentTitle,setAssignmentTitle]=useState('');
  const [assignmentId,setAssignmentId]=useState('');
  const [reviewSourceMessageId,setReviewSourceMessageId]=useState('');
  const [reviewSessionId,setReviewSessionId]=useState<string|null>(null);
  const [reviewConfirmed,setReviewConfirmed]=useState(false);
  const reviewKeyRef=useRef<{conversation:string;input:string;assignment:string;key:string}|null>(null);
  const [isGradingLoading, setIsGradingLoading] = useState(false);
  const [gradingError, setGradingError] = useState('');
  const [formError, setFormError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopySuggestion = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Custom Field Form State
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'select'>('text');
  const [newFieldUseInSug, setNewFieldUseInSug] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState('');

  useEffect(() => {
    setGradingInput(''); setAssignmentTitle(''); setAssignmentId('');
    setReviewSourceMessageId('');
    setReviewSessionId(null); setReviewConfirmed(false); setGradingError('');
    setIsGradingLoading(false); reviewKeyRef.current = null;
    setIsPronounMenuOpen(false);
    setIsAddingField(false);setAttributesOpen(false);setNewFieldName('');setNewFieldType('text');setNewFieldOptions('');setNewFieldUseInSug(false);setFormError('');
  }, [conversation?.id, studentIdentity?.student?.id]);
  const gradingScope = useRef('');
  gradingScope.current = `${conversation?.id || ''}:${studentIdentity?.student?.id || ''}`;

  if (!conversation) {
    return (
      <aside className="suggestion-panel assistant-panel-v2 empty">
        <div className="empty-suggestion-placeholder">
          <div className="empty-assistant-icon">🤖</div>
          <h3>Trợ lý Thầy Minh AI</h3>
          <p>Chọn một học viên để xem hồ sơ, việc cần làm tiếp theo và các câu trả lời tối ưu.</p>
        </div>
      </aside>
    );
  }

  const isRedFlag =
    conversation.intent === 'sensitive' ||
    suggestions.some((s) => s.sensitivity === 'do') ||
    !!conversation.flagReason;

  const currentSensitivity = isRedFlag
    ? 'do'
    : suggestions.some((s) => s.sensitivity === 'vang')
    ? 'vang'
    : 'xanh';

  const handleSelectPronoun = (pair: PronounPair) => {
    onChangePronouns(pair);
    setIsPronounMenuOpen(false);
  };

  const handleCreateCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    const options = newFieldOptions
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (newFieldType === 'select' && options.length === 0) {
      setFormError('Field lựa chọn cần ít nhất một option, ngăn cách bằng dấu phẩy.');
      return;
    }
    setFormError('');
    try {
      await onAddCustomField({
        name: newFieldName.trim(),
        type: newFieldType,
        fillMode: 'manual',
        useInSuggestions: newFieldUseInSug,
        value: '',
        options: newFieldType === 'select' ? options : undefined
      });
      setNewFieldName('');
      setNewFieldOptions('');
      setIsAddingField(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không lưu được custom field.');
    }
  };

  const handleGenerateGrading = async () => {
    if (!gradingInput.trim()) return;
    let request=reviewKeyRef.current;
    const assignmentSelection=`${assignmentId||`new:${assignmentTitle.trim()}`}:source:${reviewSourceMessageId}`;
    if(!request||request.conversation!==conversation.id||request.input!==gradingInput.trim()||request.assignment!==assignmentSelection) {
      request={conversation:conversation.id,input:gradingInput.trim(),assignment:assignmentSelection,key:crypto.randomUUID()};
      reviewKeyRef.current=request;
    }
    const scope = gradingScope.current;
    setIsGradingLoading(true);
    setGradingError('');
    try {
      const sessionId=await onGradeAssignment(gradingInput,assignmentId||undefined,assignmentId?undefined:assignmentTitle.trim()||undefined,request.key,reviewSourceMessageId||undefined);
      if(scope === gradingScope.current && sessionId) {setReviewSessionId(sessionId);if(sessionId !== reviewSessionId)setReviewConfirmed(false);}
    } catch (error) {
      if(scope === gradingScope.current) setGradingError(error instanceof Error ? error.message : 'Không tạo được nhận xét.');
    } finally {
      if(scope === gradingScope.current) setIsGradingLoading(false);
    }
  };

  const handleConfirmReview=async()=>{
    if(!reviewSessionId||!onConfirmReviewSession)return;
    const scope = gradingScope.current;
    setGradingError(''); setIsGradingLoading(true);
    try {await onConfirmReviewSession(reviewSessionId);if(scope === gradingScope.current) setReviewConfirmed(true);}
    catch(error){if(scope === gradingScope.current) setGradingError(error instanceof Error?error.message:'Không xác nhận được lượt trả bài.');}
    finally {if(scope === gradingScope.current) setIsGradingLoading(false);}
  };

  const profile = conversation.profile;
  const defaultFields: ProfileField[] = profile?.fields || [
    { key: 'recipient', label: 'Tên gọi người nhận', value: conversation.studentName, source: 'user_input' },
    { key: 'sender', label: 'Người gửi xưng', value: currentPronoun.senderCall, source: 'user_input' },
    { key: 'special', label: 'Lưu ý đặc biệt', value: '', source: 'empty' },
    { key: 'study', label: 'Ghi chú học tập', value: '', source: 'empty' },
    { key: 'next', label: 'Việc cần làm tiếp', value: 'Chưa xác định', source: 'empty' }
  ];

  const customFields: CustomField[] = profile?.customFields || [];
  const memories: MemoryItem[] = conversation.memories || [];
  const assignmentOptions = conversation.assignmentOptions || [];
  const currentGradingSelection = `${assignmentId || `new:${assignmentTitle.trim()}`}:source:${reviewSourceMessageId}`;
  const gradingDraftChanged = Boolean(reviewKeyRef.current && (reviewKeyRef.current.input !== gradingInput.trim() || reviewKeyRef.current.assignment !== currentGradingSelection));

  return (
    <aside className="suggestion-panel assistant-panel-v2">
      {/* 1. PHẦN TRÊN CỐ ĐỊNH (PINNED TOP BAR) */}
      <div className="assistant-pinned-top">
        <div className="pinned-row-primary">
          <span className="student-recipient-title" title={conversation.studentName}>{conversation.studentName}</span>
          <div className="pinned-actions-right">
            <div className="pronoun-dropdown-wrapper">
              <button
                type="button"
                className="btn-quick-pronoun"
                onClick={() => setIsPronounMenuOpen(!isPronounMenuOpen)}
                aria-expanded={isPronounMenuOpen}
                title="Bấm để đổi nhanh cặp xưng hô"
              >
                <span className="pronoun-label">Xưng hô:</span>
                <strong className="pronoun-value">{currentPronoun.label}</strong>
                <span className="chevron-down">▾</span>
              </button>

              {isPronounMenuOpen && (
                <div className="pronoun-popover-menu">
                  <div className="popover-header">Chọn cặp xưng hô</div>
                  {COMMON_PRONOUNS.map((pair) => (
                    <button
                      key={pair.label}
                      type="button"
                      className={`pronoun-option-btn ${pair.label === currentPronoun.label ? 'selected' : ''}`}
                      onClick={() => handleSelectPronoun(pair)}
                    >
                      <span className="pair-label">{pair.label}</span>
                      <span className="pair-detail">({pair.senderCall} gọi {pair.recipientCall})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {onCloseMobile && (
              <button
                type="button"
                className="btn-close-mobile-assistant"
                onClick={onCloseMobile}
                aria-label="Đóng trợ lý"
                title="Đóng trợ lý"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {(isContextLoading || isSavingContext || !studentSummary || studentSummary.facts.some(fact => fact.conflictStatus === 'pending')) && <div className="student-badge-cluster">
            <span className={`data-status-pill status-${studentSummary ? 'saved' : profile?.dataStatus || 'unclear'}`}>
              {isContextLoading
                ? 'Đang tải hồ sơ'
                : isSavingContext
                  ? 'Đang lưu'
                  : studentIdentity?.status === 'needs_selection'
                    ? 'Chưa liên kết hồ sơ'
                  : studentSummary?.facts.some((fact) => fact.conflictStatus === 'pending')
                    ? 'Cần kiểm tra mâu thuẫn'
                  : studentSummary
                    ? 'Hồ sơ sẵn sàng'
                  : profile?.dataStatus === 'conflict'
                    ? 'Có mâu thuẫn'
                    : profile?.dataStatus === 'ai_suggested'
                      ? 'AI đề xuất'
                      : profile?.dataStatus === 'saved'
                        ? 'Đã lưu'
                        : 'Chưa tải được hồ sơ'}
            </span>
            {studentIdentity?.status === 'needs_selection' && (
              <button type="button" className="student-link-shortcut" onClick={() => setActiveTab('profile')}>
                Tạo/liên kết hồ sơ
              </button>
            )}
        </div>}

        {profile?.nextAction && profile.nextAction !== 'Chưa xác định' && (
          <div className="pinned-next-action">
            <span className="action-lead">Việc tiếp theo</span>
            <span className="action-text">{profile.nextAction}</span>
          </div>
        )}
      </div>

      {/* 2. 4 TABS NAVIGATION */}
      <div className="assistant-tabs-nav" role="tablist" aria-label="Chức năng trợ lý" onKeyDown={(event) => {
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if(next >= 0) {event.preventDefault(); tabs[next].click(); tabs[next].focus();}
      }}>
        {([
          ['suggestions', `Gợi ý${suggestions.length ? ` · ${suggestions.length}` : ''}`],
          ['profile', 'Hồ sơ'], ['grading', 'Chấm bài'],
          ['memories', `Ghi nhớ${studentSummary?.facts.length ? ` · ${studentSummary.facts.length}` : ''}`]
        ] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" id={`assistant-tab-${tab}`}
          aria-selected={activeTab === tab} aria-controls={`assistant-content-${tab}`} tabIndex={activeTab === tab ? 0 : -1}
          className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{label}</button>)}
      </div>

      {/* 3. TAB CONTENT AREA */}
      <div key={`${conversation.id}:${activeTab}`} className="assistant-tab-body" role="tabpanel" id={`assistant-content-${activeTab}`} aria-labelledby={`assistant-tab-${activeTab}`} tabIndex={0}>
        {/* TAB 1: GỢI Ý */}
        {activeTab === 'suggestions' && (
          <div className="tab-pane pane-suggestions">
            {/* Cờ Đỏ cảnh báo */}
            {isRedFlag && (
              <div className="red-flag-alert-banner" role="alert">
                <div className="banner-content">
                  <strong>Cảnh báo cần người thật kiểm tra</strong>
                  <p>
                    {conversation.flagReason || 'Hội thoại có nội dung nhạy cảm. Ưu tiên phản hồi an toàn và kiểm tra chính sách trước khi gửi.'}
                  </p>
                </div>
              </div>
            )}

            {currentSensitivity === 'vang' && (
              <div className="yellow-flag-alert-banner" role="status">
                <span className="banner-text">
                  Nội dung cần được kiểm tra kỹ trước khi dùng. Không bổ sung chính sách hoặc dữ kiện chưa có trong nguồn.
                </span>
              </div>
            )}

            {conversation.generationFacts && <details className="generation-facts"><summary>Dữ kiện hồ sơ đã dùng ({conversation.generationFacts.length})</summary>
              <p className="field-help-note">Ghi nhớ đã xác nhận còn hiệu lực được tham khảo cho lần soạn này. Dữ liệu riêng tư và hết hiệu lực được loại ra.</p>
              {conversation.generationFacts.map(fact=><div key={fact.id}><p>{fact.content}</p>{fact.sourceMessageId&&onOpenEvidence&&<button type="button" className="learning-text-button" onClick={()=>onOpenEvidence(fact.sourceConversationId||conversation.id,fact.sourceMessageId)}>Xem tin nguồn ↗</button>}</div>)}
            </details>}
            <div className="pane-action-bar">
              <div className="pane-action-heading"><strong>Gợi ý trả lời <HelpTip title="Gợi ý trả lời">AI đọc tin mới của học viên và hồ sơ đã xác nhận, sau đó soạn ba câu để bạn chọn hoặc sửa. Hãy kiểm tra rồi tự gửi qua Pancake.</HelpTip></strong><small>AI soạn 3 phương án để bạn duyệt.</small></div>
              <button
                type="button"
                className="btn-create-suggestion"
                onClick={onGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span className="spinner-small" /> Đang soạn...
                  </>
                ) : (
                  'Tạo gợi ý'
                )}
              </button>
            </div>
            {isGenerating ? (
              <div className="generating-skeleton-list">
                <div className="skeleton-card" />
                <div className="skeleton-card" />
                <div className="skeleton-card" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="empty-tab-note">
                <p>Chưa có gợi ý. Bấm “Tạo gợi ý” ở trên để bắt đầu.</p>
              </div>
            ) : (
              <div className="suggestion-cards-stack">
                {suggestions.map((sug, index) => {
                  const sens = sug.sensitivity || 'xanh';
                  return (
                    <div key={sug.id} className={`suggestion-card-v2 card-${sens}`}>
                      <div className="card-header-v2">
                        <div className="card-tone-box">
                          <span className="tone-pill">Phương án #{index + 1}</span>
                          <span className="tone-name">{sug.tone}</span>
                        </div>
                        <span className={`sens-tag sens-${sens}`}>
                          {sens === 'do' ? '🔴 Cờ đỏ' : sens === 'vang' ? '🟡 Chú ý' : '🟢 Chuẩn'}
                        </span>
                      </div>

                      <div className="card-body-v2">
                        <p className="card-text">{sug.content}</p>
                      </div>

                      {sug.usedFacts && sug.usedFacts.length > 0 && (
                        <div className="card-facts-row">
                          <span className="fact-label">Dữ kiện:</span>
                          {sug.usedFacts.map((fact, idx) => (
                            <span key={idx} className="fact-chip">
                              ✓ {fact}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="card-footer-v2">
                        <button
                          type="button"
                          className="btn-apply-suggestion"
                          onClick={() => onUseSuggestion(sug.content)}
                          title="Chèn nội dung câu này vào ô soạn thảo"
                        >
                          👉 Dán vào ô soạn
                        </button>
                        <button
                          type="button"
                          className={`btn-quick-copy ${copiedId === sug.id ? 'copied' : ''}`}
                          onClick={() => handleCopySuggestion(sug.id, sug.content)}
                          title="Sao chép nhanh câu này vào Clipboard"
                        >
                          {copiedId === sug.id ? '✓ Đã copy!' : '📋 Copy'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}
        {/* TAB 2: HỒ SƠ */}
        {activeTab === 'profile' && (
          <div className="tab-pane pane-profile">
            <StudentLearningCard
              key={`${conversation.id}:${studentIdentity?.student?.id || "unlinked"}:profile`}
              loading={isContextLoading}
              identity={studentIdentity||null}
              students={studentOptions}
              summary={studentSummary||null}
              conversationId={conversation.id}
              messages={conversation.messages}
              onLink={onLinkStudent|| (async()=>{})}
              onOpenEvidence={onOpenEvidence}
              onRefresh={onRefreshStudentSummary|| (async()=>null)}
              onSyncHistory={onSyncConversationHistory|| (async()=>null)}
              onStartReview={(id,sourceId) => {setAssignmentId(id || ""); setAssignmentTitle("");
                setReviewSourceMessageId(sourceId || studentSummary?.submissions.find((item) => item.assignmentId === id && item.conversationId === conversation.id)?.sourceMessageId || ""); setActiveTab("grading");}}
              onManageAttributes={() => { setAttributesOpen(true); setIsAddingField(true); requestAnimationFrame(() => attributesRef.current?.scrollIntoView({behavior:'smooth',block:'start'})); }}
            />
            {studentIdentity?.status==='linked' ? <>
            <div className="profile-attributes-heading" ref={attributesRef}><span>Thuộc tính bổ sung <HelpTip title="Thuộc tính bổ sung">Tạo mục thông tin riêng cho học viên đang chat, ví dụ “Ca học” hoặc “Trình độ”. Chọn dạng Danh sách để có các lựa chọn. Trong ô chọn, gõ giá trị chưa có rồi bấm “Thêm lựa chọn”; giá trị mới được lưu vào danh sách của thuộc tính này.</HelpTip></span><button type="button" className="learning-text-button" onClick={() => { setAttributesOpen(true); setIsAddingField(true); }}>＋ Thêm thuộc tính</button></div>
            <details className="profile-advanced-details" open={attributesOpen} onToggle={event => { setAttributesOpen(event.currentTarget.open); if (!event.currentTarget.open) setIsAddingField(false); }}>
              <summary>Xem thuộc tính ({customFields.length})</summary>
            <div className="profile-section-header">
              <span className="section-title">Ghi chú từ hồ sơ cũ</span>
              <span className="section-hint">Chỉ hiển thị khi có dữ liệu</span>
            </div>

            <div className="profile-fields-list">
              {defaultFields.filter(field => !['recipient','sender'].includes(field.key) && field.source !== 'empty' && Boolean(field.value)).map((field) => (
                <div key={field.key} className={`profile-field-card ${field.source === 'conflict' ? 'field-conflict' : ''}`}>
                  <div className="field-top-row">
                    <span className="field-label">{field.label}</span>
                    <span className={`source-badge badge-${field.source}`}>
                      {field.source === 'confirmed' && 'Đã xác nhận'}
                      {field.source === 'user_input' && 'Người dùng nhập'}
                      {field.source === 'ai_suggested' && 'AI đề xuất'}
                      {field.source === 'conflict' && 'Có mâu thuẫn'}
                      {field.source === 'empty' && 'Chưa có thông tin'}
                    </span>
                  </div>

                  <div className="field-current-value">
                    {field.value || <span className="text-muted">(Chưa có dữ liệu)</span>}
                  </div>
                  {field.evidence && <div className="field-evidence">Nguồn: “{field.evidence}”</div>}

                  {/* Dòng so sánh nếu AI có đề xuất khác hoặc có mâu thuẫn */}
                  {field.aiSuggestion && field.aiSuggestion !== field.value && (
                    <div className="field-comparison-box">
                      <div className="comparison-header">
                        <span>🤖 AI phát hiện cập nhật mới:</span>
                        {field.conflictReason && (
                          <span className="conflict-reason-text">({field.conflictReason})</span>
                        )}
                      </div>
                      <div className="comparison-suggestion-text">{field.aiSuggestion}</div>
                      <div className="comparison-actions">
                        <button
                          type="button"
                          className="btn-accept-ai"
                          onClick={() => onAcceptAiProfileSuggestion(field.key, field.aiSuggestion!)}
                        >
                          ✓ Cập nhật theo AI
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Trường tùy biến (Custom Fields) */}
            <div className="custom-fields-section">
              <div className="custom-fields-header">
                <span className="section-title">Thuộc tính đã tạo ({customFields.length})</span>
                <button
                  type="button"
                  className="btn-add-custom-field"
                  onClick={() => setIsAddingField(!isAddingField)}
                >
                  {isAddingField ? '✕ Đóng' : '+ Thêm thuộc tính'}
                </button>
              </div>

              {isAddingField && (
                <form className="add-field-form" onSubmit={handleCreateCustomField}>
                  <div className="form-group">
                    <label>Tên thuộc tính <HelpTip title="Tên thuộc tính">Đặt tên thông tin bạn muốn theo dõi, ví dụ “Ca học ưa thích”. Đây là tên ô thông tin, không phải giá trị như “Tối thứ 7”.</HelpTip></label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="VD: Cây số cách trung tâm, Ca học ưa thích..."
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Dạng thông tin <HelpTip title="Dạng thông tin">Văn bản: tên hoặc ghi chú. Số: tuổi, số buổi học. Danh sách: các lựa chọn như “Sáng”, “Chiều”. Bạn có thể bổ sung lựa chọn mới khi sử dụng, không phải tạo lại thuộc tính.</HelpTip></label>
                      <SearchSelect
                        className="form-select"
                        value={newFieldType}
                        onChange={(e) => setNewFieldType(e.target.value as any)}
                      >
                        <option value="text">Văn bản (Text)</option>
                        <option value="number">Số (Number)</option>
                        <option value="select">Danh sách lựa chọn</option>
                      </SearchSelect>
                    </div>

                    <div className="form-group">
                      <label>Ai nhập thông tin? <HelpTip title="Cách điền thuộc tính">Bạn tự nhập hoặc chọn giá trị rồi lưu. AI chưa tự điền thuộc tính này từ tin nhắn. Trong mục Đề xuất, AI có thể gợi ý ghi nhớ hoặc lỗi có nguồn để bạn duyệt. Nếu bật “Dùng cho AI”, AI đọc giá trị bạn đã lưu khi soạn gợi ý chat.</HelpTip></label>
                      <p className="field-help-note">Nhân viên nhập và xác nhận. AI chưa tự điền thuộc tính.</p>
                    </div>
                  </div>

                  {newFieldType === 'select' && (
                    <div className="form-group">
                      <label>Lựa chọn ban đầu (cách nhau bằng dấu phẩy) <HelpTip title="Lựa chọn ban đầu">Nhập vài giá trị để bắt đầu, ví dụ “Sáng, Chiều”. Sau này bạn có thể gõ giá trị mới ngay trong ô chọn của thuộc tính và bấm “Thêm lựa chọn”.</HelpTip></label>
                      <input className="form-input" value={newFieldOptions} onChange={(e) => setNewFieldOptions(e.target.value)} placeholder="Nhanh, Vừa, Chậm" />
                    </div>
                  )}

                  {formError && <div className="inline-form-error" role="alert">{formError}</div>}

                  <div className="form-checkbox-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newFieldUseInSug}
                        onChange={(e) => setNewFieldUseInSug(e.target.checked)}
                      />
                      <span>Cho phép AI đọc giá trị đã lưu khi soạn gợi ý chat</span>
                    </label>
                  </div>

                  <div className="form-submit-row">
                    <button type="submit" className="btn-primary-small" disabled={isSavingContext}>
                      {isSavingContext ? 'Đang lưu…' : 'Tạo thuộc tính'}
                    </button>
                    <button
                      type="button"
                      className="btn-cancel-small"
                      onClick={() => setIsAddingField(false)}
                    >
                      Hủy
                    </button>
                  </div>
                </form>
              )}

              {customFields.length === 0 ? (
                <div className="empty-field-note">Chưa có thuộc tính. Bấm “Thêm thuộc tính” để tạo mục thông tin bạn cần.</div>
              ) : (
                <div className="custom-fields-list">
                  {customFields.filter((field) => !field.hidden).map((field) => (
                    <CustomFieldEditor
                      key={field.id}
                      field={field}
                      disabled={isSavingContext}
                      onSave={(changes) => onUpdateCustomField?.(field.id, changes)}
                      onDelete={() => onDeleteCustomField?.(field.id)}
                    />
                  ))}
                </div>
              )}
            </div>
            </details>
            </> : null}
          </div>
        )}
        {/* Chấm bài: chọn bài, nhập nhận xét hiện tại, duyệt rồi xác nhận gửi. */}
        {activeTab === 'grading' && (
          <div className="tab-pane pane-grading grading-workspace">
            <div className="pane-action-heading"><strong>Chấm bài cho {studentIdentity?.student?.name || conversation.studentName}</strong><small>AI diễn đạt nhận xét; giáo viên xác nhận lỗi của bài hiện tại.</small></div>
            {studentIdentity?.status !== 'linked' && <div className="grading-identity-warning"><p>Chưa liên kết học viên. AI chỉ dùng nhận xét bạn nhập; lượt trả bài chưa được lưu vào hồ sơ.</p><button type="button" className="learning-text-button" onClick={() => setActiveTab('profile')}>Liên kết hồ sơ học viên →</button></div>}
            <div className="grading-input-container">
              {studentIdentity?.status === 'linked' && <div className="grading-step">
                <span className="grading-step-number">1</span><label htmlFor="grading-assignment" className="grading-label">Chọn bài đang tập <HelpTip title="Chọn bài đang tập">Chọn bài của học viên này. Nếu chưa có, nhập tên rồi bấm “Thêm bài”; bài mới được lưu khi tạo gợi ý thành công.</HelpTip></label>
                <SearchSelect id="grading-assignment" className="grading-assignment-input" value={assignmentId || (assignmentTitle ? `new:${assignmentTitle}` : '')} onChange={(event) => { if (event.target.value.startsWith('new:')) { setAssignmentId(''); setAssignmentTitle(event.target.value.slice(4)); } else { setAssignmentId(event.target.value); setAssignmentTitle(''); } }}
                  createLabel="Thêm bài" onCreate={(name) => { setAssignmentId(''); setAssignmentTitle(name); }} disabled={isGradingLoading}>
                  <option value="">Chưa chọn bài / bài mới</option>
                  {studentSummary?.assignments.filter((assignment) => assignment.status !== 'completed').map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title} · {assignment.id.slice(-6)}</option>)}
                  {!assignmentId && assignmentTitle && <option value={`new:${assignmentTitle}`}>Bài mới: {assignmentTitle}</option>}
                </SearchSelect>
                <p className="learning-muted">Tìm bài có sẵn hoặc gõ tên và chọn “Thêm bài”. Bài mới được lưu khi tạo gợi ý thành công.</p>
                <div className="grading-new-assignment"><label htmlFor="grading-source">Tin nộp bài <HelpTip title="Tin nộp bài">Chọn tin học viên gửi bài để gắn nhận xét với đúng lần nộp. Nếu để mặc định, backend tìm tin mới nhất thuộc học viên đang chat.</HelpTip></label><SearchSelect id="grading-source" className="grading-assignment-input" value={reviewSourceMessageId} onChange={(event) => {
                  setReviewSourceMessageId(event.target.value);
                  const submission=studentSummary?.submissions.find((item) => item.sourceMessageId === event.target.value);
                  if(submission?.assignmentId)setAssignmentId(submission.assignmentId);
                }} disabled={isGradingLoading}>
                  <option value="">Tin mới nhất thuộc học viên này</option>
                  {studentSummary?.submissions.filter((item) => item.conversationId === conversation.id).map((item) => <option key={item.id} value={item.sourceMessageId}>{item.assignmentTitle || 'Chưa chọn bài'} · {new Date(item.submittedAt).toLocaleDateString('vi-VN')}</option>)}
                  {reviewSourceMessageId && !studentSummary?.submissions.some((item) => item.sourceMessageId === reviewSourceMessageId) && <option value={reviewSourceMessageId}>Tin đã chọn cho lượt trả bài này</option>}
                </SearchSelect></div>
              </div>}
              <div className="grading-step">
                <span className="grading-step-number">{studentIdentity?.status === 'linked' ? '2' : '1'}</span><label htmlFor="grading-teacher-input" className="grading-label">Nhận xét giáo viên cho bài hiện tại <HelpTip title="Chấm bài bằng AI">Nhập lỗi và cách sửa giáo viên đã xác nhận, rồi bấm “Soạn 3 phương án nhận xét”. AI diễn đạt lại lời nhận xét, không tự xem video để kết luận lỗi. Kiểm tra nội dung, sao chép sang Pancake, gửi rồi xác nhận “Đã gửi”.</HelpTip></label>
                <textarea id="grading-teacher-input" className="grading-textarea" placeholder="Ví dụ: Ô nhịp 16 ngón 2 trượt phím đen do cổ tay thấp. Dặn tập chậm với tempo 50…" value={gradingInput} onChange={(event) => setGradingInput(event.target.value)} rows={5} maxLength={2000} disabled={isGradingLoading} />
                <small className="learning-muted">Ghi đúng lỗi và cách sửa giáo viên đã nhận xét. Lỗi cũ không tự trở thành lỗi hiện tại.</small>
              </div>
              {(studentSummary?.unresolvedIssues.length || 0) > 0 && <details className="grading-history-reference"><summary>Lỗi trước đây & cách sửa gần nhất ({studentSummary?.unresolvedIssues.length})</summary>
                {studentSummary?.unresolvedIssues.slice(0, 5).map((issue) => <div key={issue.id}><b>{issue.title}</b><p>{issue.latestPracticeAction || 'Chưa có cách sửa đã lưu.'}</p></div>)}
                <button type="button" className="learning-text-button" onClick={() => setActiveTab('profile')}>Xem đầy đủ căn cứ trong hồ sơ →</button>
              </details>}
              <button type="button" className="btn-generate-grading" onClick={handleGenerateGrading} disabled={!gradingInput.trim() || isGradingLoading || isContextLoading}>
                {isGradingLoading ? <><span className="spinner-small" />Đang xử lý…</> : 'Soạn 3 phương án nhận xét'}
              </button>
              {gradingError && <div className="inline-form-error" role="alert">{gradingError}</div>}
            </div>
            <div className="grading-options-stack">
              {gradingDraftChanged && <p className="learning-pending" role="status">Nhận xét hoặc bài đã thay đổi. Soạn lại để cập nhật các phương án bên dưới trước khi xác nhận gửi.</p>}
              {assignmentOptions.length === 0 ? <div className="learning-empty"><b>Chưa có nhận xét được soạn</b><p>Nhập nhận xét giáo viên ở trên để AI đề xuất câu chữ.</p></div> : <>
                <div className="grading-review-step"><span className="grading-step-number">3</span><b>Duyệt lời nhận xét <HelpTip title="Duyệt lời nhận xét">Đọc lại nội dung AI soạn. Sao chép phương án bạn chọn, gửi qua Pancake, rồi bấm xác nhận đã gửi để lưu lượt trả bài.</HelpTip></b></div>
                {assignmentOptions.map((option) => <article key={option.id} className="grading-card"><div className="grading-card-top"><span className="grading-tone-name">{option.tone}</span></div><p className="grading-card-content">{option.content}</p>
                  {option.usedFacts && <details className="grading-used-facts"><summary>Căn cứ AI đã dùng</summary>{option.usedFacts.map((fact, index) => <p key={index}>{fact}</p>)}</details>}
                  <div className="grading-card-footer"><button type="button" className="btn-apply-suggestion" onClick={() => onUseSuggestion(option.content)}>Đưa vào bản nháp</button></div>
                </article>)}
              </>}
            </div>
            {reviewSessionId && !reviewConfirmed && <div className="review-confirm-row grading-confirm"><b>Xác nhận lượt trả bài</b><p>Sau khi gửi nhận xét qua Pancake, bấm xác nhận để tính một lượt trả bài. Soạn lại câu chữ không tăng số lượt.</p><button type="button" className="btn-primary-small" disabled={isGradingLoading || gradingDraftChanged} onClick={() => void handleConfirmReview()}>Đã gửi nhận xét qua Pancake</button></div>}
            {reviewConfirmed && <div className="review-confirmed-note" role="status">Đã xác nhận lượt trả bài trong hồ sơ.</div>}
          </div>
        )}

        {activeTab === 'memories' && <div className="tab-pane pane-memories">
          <StudentLearningCard
            key={`${conversation.id}:${studentIdentity?.student?.id || 'unlinked'}:memories`}
            mode="memories" loading={isContextLoading} identity={studentIdentity || null} students={studentOptions}
            summary={studentSummary || null} conversationId={conversation.id} messages={conversation.messages}
            onLink={onLinkStudent || (async () => {})} onOpenEvidence={onOpenEvidence}
            onRefresh={onRefreshStudentSummary || (async () => null)} onSyncHistory={onSyncConversationHistory || (async () => null)}
          />
          {studentIdentity?.status === 'linked' && memories.length > 0 && <details className="profile-advanced-details"><summary>Ghi nhớ từ giao diện cũ ({memories.length})</summary>
            <p className="learning-muted">Ghi nhớ mới được quản lý ở phía trên. Kiểm tra và xác nhận dữ liệu đã chuyển từ hồ sơ cũ trước khi dùng cho AI.</p>
            {memories.map((memory) => <article className="learning-fact-card" key={memory.id}><p>{memory.content}</p><small>{memory.reason}</small>
              <div className="learning-button-row"><span className="learning-tag">{memory.status === 'active' ? 'Đã lưu ở hồ sơ cũ' : memory.status === 'archived' ? 'Đã lưu trữ' : 'Cần kiểm tra'}</span>
                <button type="button" className="learning-text-button" onClick={() => onMemoryAction?.(memory.id, memory.status === 'archived' ? 'restore' : 'archive')} disabled={isSavingContext}>{memory.status === 'archived' ? 'Khôi phục' : 'Lưu trữ'}</button>
                <button type="button" className="learning-text-button" onClick={() => onDeleteMemory?.(memory.id)} disabled={isSavingContext}>Xóa ghi nhớ cũ</button>
              </div>
            </article>)}
          </details>}
        </div>}

      </div>
    </aside>
  );
};

function CustomFieldEditor({
  field,
  disabled,
  onSave,
  onDelete
}: {
  field: CustomField;
  disabled?: boolean;
  onSave: (changes: { value?: string; addOption?: string; useInSuggestions?: boolean; hidden?: boolean }) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}) {
  const [value, setValue] = useState(field.value);
  const [useAI,setUseAI]=useState(field.useInSuggestions);
  useEffect(()=>{setUseAI(field.useInSuggestions);},[field.useInSuggestions]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { setValue(field.value); }, [field.value]);
  const [error, setError] = useState('');

  const save = async () => {
    if (field.type === 'number' && value.trim() && !Number.isFinite(Number(value))) {
      setError('Giá trị phải là số.');
      return;
    }
    setError('');
    try {
      await onSave({ value });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không lưu được giá trị.');
    }
  };

  const addOption = async (name:string) => {
    setError(''); setNotice(''); setAdding(true);
    try { await onSave({addOption:name,value:name}); setNotice('Đã thêm lựa chọn và lưu giá trị.'); }
    catch(error) { setError(error instanceof Error ? error.message : 'Không thêm được lựa chọn.'); }
    finally { setAdding(false); }
  };
  return (
    <div className="custom-field-item">
      <div className="cf-meta">
        <span className="cf-name">{field.name} <HelpTip title={field.name}>Nhập hoặc chọn giá trị cho học viên đang chat. Với dạng danh sách, gõ lựa chọn chưa có và bấm “Thêm lựa chọn” để lưu ngay vào danh sách và chọn giá trị đó. Chọn mục đã có thì bấm “Lưu giá trị”. {field.fillMode !== 'manual' && 'Thuộc tính này có cấu hình AI cũ, nhưng AI chưa tự điền; hiện bạn vẫn cần nhập và lưu.'}</HelpTip></span>
        <span className="cf-tag">{field.fillMode === 'manual' ? 'Tự điền' : 'AI cũ · cần nhập tay'}</span>
        {field.useInSuggestions && <span className="cf-ai-tag">Dùng cho AI</span>}
      </div>
      {field.type === 'select' ? (
        <SearchSelect aria-label={field.name} className="form-select" value={value} disabled={disabled || adding} createLabel="Thêm lựa chọn" onCreate={name => void addOption(name)} onChange={(event) => { setValue(event.target.value); setNotice(''); }}>
          <option value="">Chưa chọn</option>
          {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </SearchSelect>
      ) : (
        <input
          className="form-input"
          type={field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Chưa có giá trị"
        />
      )}
      {field.type === 'select' && <small className="field-help-note">Gõ để tìm hoặc thêm lựa chọn mới.</small>}
      {notice && <div className="learning-notice" role="status">{notice}</div>}
      {adding && <p role="status">Đang thêm lựa chọn…</p>}
      {field.evidence && <div className="field-evidence">Tiêu chí/nguồn: {field.evidence}</div>}
      {error && <div className="inline-form-error" role="alert">{error}</div>}
      <div className="cf-actions">
        <button type="button" className="btn-primary-small" onClick={save} disabled={disabled || adding || value === field.value}>Lưu giá trị</button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={useAI}
            disabled={disabled}
            onChange={event=>{const desired=event.target.checked;setUseAI(desired);setError('');void Promise.resolve(onSave({useInSuggestions:desired})).catch(error=>{setUseAI(field.useInSuggestions);setError(error instanceof Error?error.message:'Không lưu được quyền dùng cho AI.');});}}
          />
          <span>Dùng cho AI <HelpTip title="Dùng cho AI">Khi bật, giá trị bạn đã lưu được đưa vào ngữ cảnh gợi ý chat. AI không tự điền hoặc sửa thuộc tính này.</HelpTip></span>
        </label>
        <button type="button" className="btn-memory-danger" onClick={() => void onDelete()} disabled={disabled}>Xóa thuộc tính</button>
      </div>
    </div>
  );
}
