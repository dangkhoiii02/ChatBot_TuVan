import React, { useState } from 'react';
import { Conversation, Suggestion, PronounPair, CustomField, ProfileField, MemoryItem } from '../types';

export interface SuggestionPanelProps {
  conversation?: Conversation;
  suggestions: Suggestion[];
  isGenerating: boolean;
  onGenerate: () => void;
  onUseSuggestion: (content: string) => void;
  currentPronoun: PronounPair;
  onChangePronouns: (pair: PronounPair) => void;
  onGradeAssignment: (reviewText: string) => void;
  onAddCustomField: (field: Omit<CustomField, 'id' | 'source'>) => void;
  onAcceptAiProfileSuggestion: (fieldKey: string, newValue: string) => void;
  onSaveMemory: (content: string, reason?: string) => void;
  onDeleteMemory?: (id: string) => void;
  onCloseMobile?: () => void;
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
  onAcceptAiProfileSuggestion,
  onSaveMemory,
  onCloseMobile
}) => {
  const [activeTab, setActiveTab] = useState<AssistantTab>('suggestions');
  const [isPronounMenuOpen, setIsPronounMenuOpen] = useState(false);
  const [gradingInput, setGradingInput] = useState('');
  const [isGradingLoading, setIsGradingLoading] = useState(false);

  // Custom Field Form State
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'select'>('text');
  const [newFieldFill, setNewFieldFill] = useState<'manual' | 'ai_extract' | 'ai_evaluate'>('manual');
  const [newFieldUseInSug, setNewFieldUseInSug] = useState(true);

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

  const handleCreateCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    onAddCustomField({
      name: newFieldName.trim(),
      type: newFieldType,
      fillMode: newFieldFill,
      useInSuggestions: newFieldUseInSug,
      value: newFieldType === 'number' ? '0' : 'Mới tạo'
    });

    setNewFieldName('');
    setIsAddingField(false);
  };

  const handleGenerateGrading = () => {
    if (!gradingInput.trim()) return;
    setIsGradingLoading(true);
    onGradeAssignment(gradingInput);
    setTimeout(() => {
      setIsGradingLoading(false);
    }, 500);
  };

  const handleAddMemorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;
    onSaveMemory(newMemoryContent.trim(), newMemoryReason.trim() || undefined);
    setNewMemoryContent('');
    setNewMemoryReason('');
    setIsAddingMemory(false);
  };

  const profile = conversation.profile;
  const defaultFields: ProfileField[] = profile?.fields || [
    { key: 'recipient', label: 'Tên gọi người nhận', value: conversation.studentName, source: 'confirmed' },
    { key: 'sender', label: 'Người gửi xưng', value: currentPronoun.senderCall, source: 'confirmed' },
    { key: 'special', label: 'Lưu ý đặc biệt', value: conversation.flagReason || 'Không có lưu ý đặc biệt', source: 'user_input' },
    { key: 'study', label: 'Ghi chú học tập', value: 'Đang theo học lộ trình chuẩn', source: 'confirmed' },
    { key: 'next', label: 'Việc cần làm tiếp', value: 'Chờ phản hồi từ học viên', source: 'ai_suggested' }
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
            <span className={`data-status-pill status-${profile?.dataStatus || 'saved'}`}>
              {profile?.dataStatus === 'conflict' ? '⚠️ Mâu thuẫn' : profile?.dataStatus === 'ai_suggested' ? 'AI đề xuất' : '✓ Đã lưu'}
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
      </div>

      {/* 2. 4 TABS NAVIGATION */}
      <div className="assistant-tabs-nav">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Gợi ý ({suggestions.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Hồ sơ {profile?.dataStatus === 'conflict' ? '⚠️' : ''}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'grading' ? 'active' : ''}`}
          onClick={() => setActiveTab('grading')}
        >
          Chấm bài
        </button>
        <button
          type="button"
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
              <div className="red-flag-alert-banner">
                <div className="banner-icon">🚨</div>
                <div className="banner-content">
                  <strong>CẢNH BÁO QUAN TRỌNG TỪ HỆ THỐNG:</strong>
                  <p>
                    Tuyệt đối không níu kéo, ưu tiên an ủi và hướng dẫn hoàn <strong>2.800.000đ</strong> theo
                    Policy. Bắt buộc người thật kiểm tra trước khi gửi!
                  </p>
                </div>
              </div>
            )}

            {currentSensitivity === 'vang' && (
              <div className="yellow-flag-alert-banner">
                <span className="banner-icon">🟡</span>
                <span className="banner-text">
                  Học viên có dấu hiệu bận hoặc ngắt quãng, ưu tiên khích lệ nhẹ nhàng và thông báo chính sách bảo lưu 90 ngày.
                </span>
              </div>
            )}

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
                        >
                          👉 Dùng câu này
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
                    <button type="submit" className="btn-primary-small">
                      Lưu trường
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
                  {customFields.map((cf) => (
                    <div key={cf.id} className="custom-field-item">
                      <div className="cf-meta">
                        <span className="cf-name">{cf.name}</span>
                        <span className="cf-tag">
                          {cf.fillMode === 'manual' ? 'Tự điền' : 'AI bóc tách'}
                        </span>
                        {cf.useInSuggestions && <span className="cf-ai-tag">Dùng cho AI</span>}
                      </div>
                      <div className="cf-value">{cf.value || '(Trống)'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                  <button type="submit" className="btn-primary-small">
                    Lưu ghi nhớ
                  </button>
                  <button
                    type="button"
                    className="btn-cancel-small"
                    onClick={() => setIsAddingMemory(false)}
                  >
                    Hủy
                  </button>
                </div>
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
                            onClick={() => onSaveMemory(m.content, m.reason)}
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
                    ({memories.filter((m) => m.status === 'history').length})
                  </span>
                </div>
                <div className="group-items">
                  {memories
                    .filter((m) => m.status === 'history')
                    .map((m) => (
                      <div key={m.id} className="memory-item-card item-history">
                        <div className="memory-content text-muted">{m.content}</div>
                        <div className="memory-footer">
                          <span className="memory-date">{m.createdAt}</span>
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
