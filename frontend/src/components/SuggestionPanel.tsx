import React, { useRef, useState } from 'react';
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
  onGradeAssignment: (reviewText: string, assignmentId?:string, assignmentTitle?:string, reviewSessionKey?:string) => Promise<string|void> | string | void;
  onAddCustomField: (field: Omit<CustomField, 'id' | 'source'>) => Promise<void> | void;
  onUpdateCustomField?: (id: string, changes: { value?: string; useInSuggestions?: boolean; hidden?: boolean }) => Promise<void> | void;
  onDeleteCustomField?: (id: string) => Promise<void> | void;
  onAcceptAiProfileSuggestion: (fieldKey: string, newValue: string) => void;
  onSaveMemory: (content: string, reason?: string) => Promise<void> | void;
  onDeleteMemory?: (id: string) => void;
  onMemoryAction?: (id: string, action: 'activate' | 'archive' | 'restore') => void;
  onCloseMobile?: () => void;
  aiApiKey?: string;
  aiModel?: string;
  aiMode?: 'system' | 'user_override';
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
  onOpenAiSettings?: () => void;
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
  onSaveMemory,
  onDeleteMemory,
  onMemoryAction,
  onCloseMobile,
  aiModel,
  aiMode = 'system',
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
  onOpenAiSettings
}) => {
  const [activeTab, setActiveTab] = useState<AssistantTab>('suggestions');
  const [isPronounMenuOpen, setIsPronounMenuOpen] = useState(false);
  const [gradingInput, setGradingInput] = useState('');
  const [assignmentTitle,setAssignmentTitle]=useState('');
  const [assignmentId,setAssignmentId]=useState('');
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
  const [newFieldFill, setNewFieldFill] = useState<'manual' | 'ai_extract' | 'ai_evaluate'>('manual');
  const [newFieldUseInSug, setNewFieldUseInSug] = useState(true);
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldCriteria, setNewFieldCriteria] = useState('');

  // New Memory State
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryReason, setNewMemoryReason] = useState('');

  if (!conversation) {
    return (
      <aside className="suggestion-panel empty">
        <div className="empty-suggestion-placeholder">
          <div className="empty-assistant-icon">🤖</div>
          <h3>Trợ lý Thầy Minh AI</h3>
          <p>Chọn một học viên để xem phân tích ngữ cảnh và các câu gợi ý phản hồi.</p>
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
    if (newFieldFill === 'ai_evaluate' && !newFieldCriteria.trim()) {
      setFormError('Field AI đánh giá cần mô tả tiêu chí.');
      return;
    }

    setFormError('');
    try {
      await onAddCustomField({
        name: newFieldName.trim(),
        type: newFieldType,
        fillMode: newFieldFill,
        useInSuggestions: newFieldUseInSug,
        value: '',
        options: newFieldType === 'select' ? options : undefined,
        evidence: newFieldFill === 'ai_evaluate' ? newFieldCriteria.trim() : undefined
      });
      setNewFieldName('');
      setNewFieldOptions('');
      setNewFieldCriteria('');
      setIsAddingField(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không lưu được custom field.');
    }
  };

  const handleGenerateGrading = async () => {
    if (!gradingInput.trim()) return;
    let request=reviewKeyRef.current;
    const assignmentSelection=assignmentId||`new:${assignmentTitle.trim()}`;
    if(!request||request.conversation!==conversation.id||request.input!==gradingInput.trim()||request.assignment!==assignmentSelection) {
      request={conversation:conversation.id,input:gradingInput.trim(),assignment:assignmentSelection,key:crypto.randomUUID()};
      reviewKeyRef.current=request;
    }
    setIsGradingLoading(true);
    setGradingError('');
    try {
      const sessionId=await onGradeAssignment(gradingInput,assignmentId||undefined,assignmentId?undefined:assignmentTitle.trim()||undefined,request.key);
      if(sessionId) {setReviewSessionId(sessionId);setReviewConfirmed(false);}
    } catch (error) {
      setGradingError(error instanceof Error ? error.message : 'Không tạo được nhận xét.');
    } finally {
      setIsGradingLoading(false);
    }
  };

  const handleConfirmReview=async()=>{
    if(!reviewSessionId||!onConfirmReviewSession)return;
    setGradingError('');
    try {await onConfirmReviewSession(reviewSessionId);setReviewConfirmed(true);}
    catch(error){setGradingError(error instanceof Error?error.message:'Không xác nhận được lượt trả bài.');}
  };

  const handleAddMemorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;
    setFormError('');
    try {
      await onSaveMemory(newMemoryContent.trim(), newMemoryReason.trim() || undefined);
      setNewMemoryContent('');
      setNewMemoryReason('');
      setIsAddingMemory(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không lưu được ghi nhớ.');
    }
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

  return (
    <aside className="suggestion-panel assistant-panel-v2">
      {/* 1. PHẦN TRÊN CỐ ĐỊNH (PINNED TOP BAR) */}
      <div className="assistant-pinned-top">
        <div className="pinned-row-primary">
          <div className="student-badge-cluster">
            <span className="student-recipient-title">{conversation.studentName}</span>
            <span className={`data-status-pill status-${profile?.dataStatus || 'unclear'}`}>
              {isContextLoading
                ? 'Đang tải hồ sơ'
                : isSavingContext
                  ? 'Đang lưu'
                  : profile?.dataStatus === 'conflict'
                    ? 'Có mâu thuẫn'
                    : profile?.dataStatus === 'ai_suggested'
                      ? 'AI đề xuất'
                      : profile?.dataStatus === 'saved'
                        ? 'Đã lưu'
                        : 'Chưa đủ dữ liệu'}
            </span>
          </div>
          <span className="persona-tag">Góc nhìn Thầy Minh</span>

          <div className="pinned-actions-right">
            <div className="pronoun-dropdown-wrapper">
              <button
                type="button"
                className="btn-quick-pronoun"
                onClick={() => setIsPronounMenuOpen(!isPronounMenuOpen)}
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
                title="Đóng trợ lý"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="pinned-next-action">
          <span className="action-lead">Việc tiếp theo:</span>
          <span className="action-text">{profile?.nextAction || 'Chờ phản hồi từ học viên'}</span>
        </div>

        {/* Dải nút đổi nhanh danh xưng 1-click */}
        <div className="pinned-pronoun-strip">
          <span className="strip-title">Xưng hô nhanh:</span>
          <div className="pronoun-pills-row">
            {COMMON_PRONOUNS.map((pair) => (
              <button
                key={pair.label}
                type="button"
                className={`pronoun-quick-chip ${pair.label === currentPronoun.label ? 'active' : ''}`}
                onClick={() => onChangePronouns(pair)}
                title={`Đổi xưng hô: ${pair.senderCall} — ${pair.recipientCall}`}
              >
                {pair.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. 4 TABS NAVIGATION */}
      <div className="assistant-tabs-nav" role="tablist" aria-label="Chức năng trợ lý">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'suggestions'}
          className={`tab-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Gợi ý ({suggestions.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Hồ sơ {profile?.dataStatus === 'conflict' ? '⚠️' : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'grading'}
          className={`tab-btn ${activeTab === 'grading' ? 'active' : ''}`}
          onClick={() => setActiveTab('grading')}
        >
          Chấm bài
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'memories'}
          className={`tab-btn ${activeTab === 'memories' ? 'active' : ''}`}
          onClick={() => setActiveTab('memories')}
        >
          Ghi nhớ ({memories.length})
        </button>
      </div>

      {/* 3. TAB CONTENT AREA */}
      <div className="assistant-tab-body">
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

            {/* AI ENGINE & MODEL STATUS STRIP */}
            <div className="suggestion-engine-strip">
              <button
                type="button"
                className="engine-status-badge"
                onClick={onOpenAiSettings}
                title="Bấm để đổi AI API Key hoặc chọn mô hình"
              >
                <span className={`engine-dot ${aiMode === 'user_override' ? 'dot-live' : 'dot-mock'}`} />
                <span className="engine-text">
                  {aiMode === 'user_override' ? (
                    <>Cấu hình riêng: <strong>{aiModel || 'chưa đủ model'}</strong></>
                  ) : (
                    <>Cấu hình: <strong>AI hệ thống</strong></>
                  )}
                </span>
                {onOpenAiSettings && (
                  <span className="btn-engine-change">Đổi cấu hình</span>
                )}
              </button>
            </div>

            <div className="pane-action-bar">
              <span className="pane-title">3 phương án phản hồi tối ưu:</span>
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
                  '⚡ Tạo gợi ý'
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
                <p>Chưa có câu gợi ý nào cho hội thoại này.</p>
                <button type="button" className="btn-secondary" onClick={onGenerate}>
                  Tạo gợi ý ngay
                </button>
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
              identity={studentIdentity||null}
              students={studentOptions}
              summary={studentSummary||null}
              conversationId={conversation.id}
              messages={conversation.messages}
              onLink={onLinkStudent|| (async()=>{})}
              onOpenEvidence={onOpenEvidence}
              onRefresh={onRefreshStudentSummary|| (async()=>null)}
              onSyncHistory={onSyncConversationHistory|| (async()=>null)}
            />
            {studentIdentity?.status==='linked' ? <>
            <div className="profile-section-header">
              <span className="section-title">Thông tin cơ bản học viên</span>
              <span className="section-hint">Tự động đồng bộ từ lịch sử chat</span>
            </div>

            <div className="profile-fields-list">
              {defaultFields.map((field) => (
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
                <span className="section-title">Trường tùy biến ({customFields.length})</span>
                <button
                  type="button"
                  className="btn-add-custom-field"
                  onClick={() => setIsAddingField(!isAddingField)}
                >
                  {isAddingField ? '✕ Đóng' : '+ Thêm trường'}
                </button>
              </div>

              {isAddingField && (
                <form className="add-field-form" onSubmit={handleCreateCustomField}>
                  <div className="form-group">
                    <label>Tên trường:</label>
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
                      <label>Kiểu dữ liệu:</label>
                      <select
                        className="form-select"
                        value={newFieldType}
                        onChange={(e) => setNewFieldType(e.target.value as any)}
                      >
                        <option value="text">Văn bản (Text)</option>
                        <option value="number">Số (Number)</option>
                        <option value="select">Lựa chọn (Select)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Cách điền dữ liệu:</label>
                      <select
                        className="form-select"
                        value={newFieldFill}
                        onChange={(e) => setNewFieldFill(e.target.value as any)}
                      >
                        <option value="manual">Tự điền tay</option>
                        <option value="ai_extract">AI tự bóc tách tin nhắn</option>
                        <option value="ai_evaluate">AI tự đánh giá</option>
                      </select>
                    </div>
                  </div>

                  {newFieldType === 'select' && (
                    <div className="form-group">
                      <label>Danh sách lựa chọn (ngăn cách bằng dấu phẩy):</label>
                      <input className="form-input" value={newFieldOptions} onChange={(e) => setNewFieldOptions(e.target.value)} placeholder="Nhanh, Vừa, Chậm" />
                    </div>
                  )}

                  {newFieldFill === 'ai_evaluate' && (
                    <div className="form-group">
                      <label>Tiêu chí AI đánh giá:</label>
                      <textarea className="form-textarea" rows={2} value={newFieldCriteria} onChange={(e) => setNewFieldCriteria(e.target.value)} placeholder="Mô tả rõ dữ kiện nào được dùng để đánh giá" />
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
                      <span>Cho phép AI sử dụng trường này khi sinh câu trả lời</span>
                    </label>
                  </div>

                  <div className="form-submit-row">
                    <button type="submit" className="btn-primary-small" disabled={isSavingContext}>
                      {isSavingContext ? 'Đang lưu…' : 'Lưu trường'}
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
                <div className="empty-field-note">Chưa có trường tùy biến nào được thêm.</div>
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
            </> : <div className="empty-tab-note">Hãy chọn hoặc tạo hồ sơ học viên trước khi sửa ghi chú cũ.</div>}
          </div>
        )}
        {/* TAB 3: CHẤM BÀI */}
        {activeTab === 'grading' && (
          <div className="tab-pane pane-grading">
            <div className="grading-instruction-box">
              <div className="instruction-icon">🎯</div>
              <div className="instruction-content">
                <strong>Chấm bài & Phản hồi kỹ thuật nhanh</strong>
                <p>Nhập ngắn gọn lỗi kỹ thuật giáo viên nhận thấy. AI sẽ diễn đạt thành 3 câu nhận xét sư phạm chuẩn phong cách Thầy Minh.</p>
              </div>
            </div>

            <div className="grading-input-container">
              {studentIdentity?.status!=='linked'&&<div className="learning-warning">Chưa chọn học viên; AI chỉ dùng nhận xét bạn nhập và nội dung hội thoại hiện tại.</div>}
              {studentIdentity?.status==='linked'&&<>
                <label className="grading-label">Bài đang tập (tuỳ chọn):</label>
                <select className="grading-assignment-input" value={assignmentId} onChange={(event)=>setAssignmentId(event.target.value)}>
                  <option value="">Bài mới hoặc chưa chọn</option>
                  {studentSummary?.assignments.filter((assignment)=>assignment.status==='active').map((assignment)=><option key={assignment.id} value={assignment.id}>{assignment.title} · {assignment.id.slice(-8)}</option>)}
                </select>
                {!assignmentId&&<input className="grading-assignment-input" value={assignmentTitle} onChange={(event)=>setAssignmentTitle(event.target.value)} placeholder="Tên bài mới (để trống nếu chưa rõ)" />}
                {(studentSummary?.unresolvedIssues.length||0)>0&&<div className="grading-history-reference"><b>Tham khảo lần trước — không tự tính là lỗi hiện tại</b>
                  {studentSummary?.unresolvedIssues.slice(0,5).map((issue)=><span key={issue.id}>{issue.title}: {issue.latestPracticeAction||'chưa có cách sửa đã lưu'}</span>)}
                  <small>Chỉ nội dung ở ô nhận xét giáo viên bên dưới được xem là lỗi của bài hiện tại.</small>
                </div>}
              </>}
              <label className="grading-label">Ghi chú nhận xét của giáo viên:</label>
              <textarea
                className="grading-textarea"
                placeholder="VD: Ô nhịp 16 ngón 2 bị trợt phím đen do cổ tay thấp. Nhắc tập kỹ thuật xoay cẳng tay (rotation) chậm lại với tempo 50..."
                value={gradingInput}
                onChange={(e) => setGradingInput(e.target.value)}
                rows={3}
              />
              <button
                type="button"
                className="btn-generate-grading"
                onClick={handleGenerateGrading}
                disabled={!gradingInput.trim() || isGradingLoading}
              >
                {isGradingLoading ? (
                  <>
                    <span className="spinner-small" /> Đang tổng hợp lời nhận xét...
                  </>
                ) : (
                  '⚡ AI soạn 3 phương án nhận xét'
                )}
              </button>
              {reviewSessionId&&!reviewConfirmed&&<div className="review-confirm-row"><small>Sau khi gửi nhận xét qua Pancake, xác nhận để tính đây là một lượt trả bài.</small>
                <button type="button" className="btn-secondary" disabled={isGradingLoading} onClick={()=>void handleConfirmReview()}>Đã gửi nhận xét</button></div>}
              {reviewConfirmed&&<div className="review-confirmed-note">✓ Lượt trả bài đã được xác nhận.</div>}
              {gradingError && <div className="inline-form-error" role="alert">{gradingError}</div>}
            </div>

            <div className="grading-options-stack">
              <div className="options-title">Các phương án nhận xét chấm bài:</div>
              {assignmentOptions.length === 0 ? (
                <div className="empty-tab-note">
                  Nhập nhận xét của bạn ở khung trên rồi bấm <strong>AI soạn lời nhận xét</strong> để tạo phương án.
                </div>
              ) : (
                assignmentOptions.map((opt) => (
                  <div key={opt.id} className="grading-card">
                    <div className="grading-card-top">
                      <span className="grading-tone-name">{opt.tone}</span>
                    </div>
                    <p className="grading-card-content">{opt.content}</p>

                    {opt.usedFacts && (
                      <div className="card-facts-row">
                        <span className="fact-label">Trọng tâm:</span>
                        {opt.usedFacts.map((f, i) => (
                          <span key={i} className="fact-chip">
                            ✓ {f}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grading-card-footer">
                      <button
                        type="button"
                        className="btn-apply-suggestion"
                        onClick={() => onUseSuggestion(opt.content)}
                      >
                        👉 Dùng câu này
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: GHI NHỚ */}
        {activeTab === 'memories' && (
          <div className="tab-pane pane-memories">
            <div className="memories-top-bar">
              <span className="section-title">Trí nhớ học viên ({memories.length})</span>
              <button
                type="button"
                className="btn-add-memory"
                onClick={() => setIsAddingMemory(!isAddingMemory)}
              >
                {isAddingMemory ? '✕ Đóng' : '+ Thêm ghi nhớ'}
              </button>
            </div>

            {isAddingMemory && (
              <form className="add-memory-form" onSubmit={handleAddMemorySubmit}>
                <div className="form-group">
                  <label>Nội dung cần nhớ:</label>
                  <textarea
                    className="form-textarea"
                    placeholder="VD: Học viên chỉ học được buổi tối sau 20h..."
                    value={newMemoryContent}
                    onChange={(e) => setNewMemoryContent(e.target.value)}
                    required
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Lý do / Bối cảnh ghi nhớ:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VD: Học viên chia sẻ trong tin nhắn tuần trước"
                    value={newMemoryReason}
                    onChange={(e) => setNewMemoryReason(e.target.value)}
                  />
                </div>
                <div className="form-submit-row">
                  <button type="submit" className="btn-primary-small" disabled={isSavingContext}>
                    {isSavingContext ? 'Đang lưu…' : 'Lưu ghi nhớ'}
                  </button>
                  <button
                    type="button"
                    className="btn-cancel-small"
                    onClick={() => setIsAddingMemory(false)}
                  >
                    Hủy
                  </button>
                </div>
                {formError && <div className="inline-form-error" role="alert">{formError}</div>}
              </form>
            )}

            {/* 3 NHÓM GHI NHỚ */}
            <div className="memory-groups-stack">
              {/* Nhóm 1: Đang áp dụng */}
              <div className="memory-group">
                <div className="group-heading">
                  <span className="group-indicator indicator-active" />
                  <span className="group-name">Đang áp dụng</span>
                  <span className="group-count">
                    ({memories.filter((m) => m.status === 'active').length})
                  </span>
                </div>
                <div className="group-items">
                  {memories
                    .filter((m) => m.status === 'active')
                    .map((m) => (
                      <div key={m.id} className="memory-item-card item-active">
                        <div className="memory-content">{m.content}</div>
                        <div className="memory-footer">
                          <span className="memory-date">{m.createdAt}</span>
                          <span className="badge-active-tag">✓ Đang dùng</span>
                          <button type="button" className="btn-memory-secondary" onClick={() => onMemoryAction?.(m.id, 'archive')} disabled={isSavingContext}>
                            Lưu trữ
                          </button>
                          <button type="button" className="btn-memory-danger" onClick={() => onDeleteMemory?.(m.id)} disabled={isSavingContext}>
                            Xóa hẳn
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Nhóm 2: AI đề xuất */}
              <div className="memory-group">
                <div className="group-heading">
                  <span className="group-indicator indicator-suggested" />
                  <span className="group-name">AI đề xuất ghi nhớ</span>
                  <span className="group-count">
                    ({memories.filter((m) => m.status === 'ai_suggested').length})
                  </span>
                </div>
                <div className="group-items">
                  {memories
                    .filter((m) => m.status === 'ai_suggested')
                    .map((m) => (
                      <div key={m.id} className="memory-item-card item-suggested">
                        <div className="memory-content">{m.content}</div>
                        {m.reason && (
                          <div className="memory-reason-box">
                            💡 <em>Lý do: {m.reason}</em>
                          </div>
                        )}
                        <div className="memory-actions-row">
                          <button
                            type="button"
                            className="btn-memory-accept"
                            onClick={() => onMemoryAction?.(m.id, 'activate')}
                          >
                            ✓ Áp dụng ghi nhớ
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Nhóm 3: Lịch sử */}
              <div className="memory-group">
                <div className="group-heading">
                  <span className="group-indicator indicator-history" />
                  <span className="group-name">Lịch sử</span>
                  <span className="group-count">
                    ({memories.filter((m) => ['history', 'archived', 'expired', 'review_due'].includes(m.status)).length})
                  </span>
                </div>
                <div className="group-items">
                  {memories
                    .filter((m) => ['history', 'archived', 'expired', 'review_due'].includes(m.status))
                    .map((m) => (
                      <div key={m.id} className="memory-item-card item-history">
                        <div className="memory-content text-muted">{m.content}</div>
                        <div className="memory-footer">
                          <span className="memory-date">{m.createdAt}</span>
                          {m.status === 'archived' && (
                            <button type="button" className="btn-memory-secondary" onClick={() => onMemoryAction?.(m.id, 'restore')} disabled={isSavingContext}>
                              Khôi phục
                            </button>
                          )}
                          <button type="button" className="btn-memory-danger" onClick={() => onDeleteMemory?.(m.id)} disabled={isSavingContext}>
                            Xóa hẳn
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
  onSave: (changes: { value?: string; useInSuggestions?: boolean; hidden?: boolean }) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}) {
  const [value, setValue] = useState(field.value);
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

  return (
    <div className="custom-field-item">
      <div className="cf-meta">
        <span className="cf-name">{field.name}</span>
        <span className="cf-tag">{field.fillMode === 'manual' ? 'Tự điền' : field.fillMode === 'ai_evaluate' ? 'AI đánh giá' : 'AI bóc tách'}</span>
        {field.useInSuggestions && <span className="cf-ai-tag">Dùng cho AI</span>}
      </div>
      {field.type === 'select' ? (
        <select className="form-select" value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">Chưa chọn</option>
          {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          className="form-input"
          type={field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Chưa có giá trị"
        />
      )}
      {field.evidence && <div className="field-evidence">Tiêu chí/nguồn: {field.evidence}</div>}
      {error && <div className="inline-form-error" role="alert">{error}</div>}
      <div className="cf-actions">
        <button type="button" className="btn-primary-small" onClick={save} disabled={disabled || value === field.value}>Lưu giá trị</button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={field.useInSuggestions}
            disabled={disabled}
            onChange={(event) => void onSave({ useInSuggestions: event.target.checked })}
          />
          <span>Dùng cho AI</span>
        </label>
        <button type="button" className="btn-memory-danger" onClick={() => void onDelete()} disabled={disabled}>Xóa field</button>
      </div>
    </div>
  );
}
