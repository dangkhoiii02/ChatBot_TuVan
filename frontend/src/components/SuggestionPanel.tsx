import React from 'react';
import { Conversation, Suggestion } from '../types';

export interface SuggestionPanelProps {
  conversation?: Conversation;
  suggestions: Suggestion[];
  isGenerating: boolean;
  onGenerate: () => void;
  onUseSuggestion: (content: string) => void;
}

export const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
  conversation,
  suggestions,
  isGenerating,
  onGenerate,
  onUseSuggestion
}) => {
  if (!conversation) {
    return (
      <aside className="suggestion-panel empty">
        <div className="empty-suggestion-placeholder">
          <h3>Trợ lý Thầy Minh AI</h3>
          <p>Chọn một học viên để xem phân tích ngữ cảnh và các câu gợi ý phản hồi.</p>
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

  return (
    <aside className="suggestion-panel">
      {/* Header Panel */}
      <div className="suggestion-header">
        <div className="suggestion-title-row">
          <div className="ai-brand-badge">
            <span className="sparkle-icon">✨</span>
            <span className="ai-brand-text">Trợ lý Phản hồi AI</span>
          </div>
          <span className="persona-tag">Góc nhìn Thầy Minh</span>
        </div>

        {/* Sensitivity indicator */}
        <div className="sensitivity-status-box">
          <span className="sensitivity-label">Độ nhạy cảm hội thoại:</span>
          {currentSensitivity === 'do' && (
            <span className="sensitivity-pill pill-red">
              🔴 CỜ ĐỎ (Khẩn cấp / Bệnh hiểm nghèo)
            </span>
          )}
          {currentSensitivity === 'vang' && (
            <span className="sensitivity-pill pill-yellow">
              🟡 CỜ VÀNG (Cần chú ý / Nguy cơ nghỉ)
            </span>
          )}
          {currentSensitivity === 'xanh' && (
            <span className="sensitivity-pill pill-green">
              🟢 CỜ XANH (Trao đổi bài học thường quy)
            </span>
          )}
        </div>

        {/* Red Flag Warning Banner */}
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

        {(conversation.aiAnalysis || conversation.flagReason || conversation.aiProvider || conversation.isDemoFallback) && (
          <div className="policy-reference-box">
            <div className="policy-title">🧠 Phân tích AI</div>
            <ul className="policy-points">
              {conversation.aiProvider && (
                <li>
                  <strong>Nguồn:</strong> {conversation.aiProvider}
                  {conversation.isDemoFallback ? ' (fallback demo)' : ''}
                </li>
              )}
              {conversation.aiAnalysis && (
                <li>
                  <strong>Nhận định:</strong> {conversation.aiAnalysis}
                </li>
              )}
              {conversation.flagReason && (
                <li>
                  <strong>Lý do phân loại:</strong> {conversation.flagReason}
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Action Button: Tao goi y */}
        <div className="generate-action-bar">
          <button
            type="button"
            className={`btn-generate ${isGenerating ? 'generating' : ''}`}
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <span className="spinner" />
                Đang tổng hợp góc nhìn Thầy Minh...
              </>
            ) : (
              <>
                <span className="refresh-icon">⚡</span>
                Tạo gợi ý từ lịch sử chat
              </>
            )}
          </button>
        </div>
      </div>

      {/* Suggestion Cards List */}
      <div className="suggestion-body">
        <div className="suggestion-list-header">
          <span className="list-title">Đề xuất phản hồi ({suggestions.length})</span>
          <span className="list-subtitle">Chọn câu phù hợp nhất để đưa vào khung chat</span>
        </div>

        {isGenerating ? (
          <div className="generating-skeleton-list">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="empty-suggestions">
            <p>Chưa có câu gợi ý nào.</p>
            <button type="button" className="btn-secondary" onClick={onGenerate}>
              Tạo ngay
            </button>
          </div>
        ) : (
          <div className="suggestion-cards">
            {suggestions.map((sug, index) => {
              const sens = sug.sensitivity || 'xanh';

              return (
                <div key={sug.id} className={`suggestion-card card-${sens}`}>
                  <div className="card-top">
                    <div className="card-tone-wrapper">
                      <span className="card-index-tag">Gợi ý #{index + 1}</span>
                      <span className="card-tone-name">{sug.tone}</span>
                    </div>

                    {sens === 'do' && <span className="card-badge badge-do">Cờ Đỏ</span>}
                    {sens === 'vang' && <span className="card-badge badge-vang">Cờ Vàng</span>}
                    {sens === 'xanh' && <span className="card-badge badge-xanh">Chuẩn</span>}
                  </div>

                  <p className="card-content">{sug.content}</p>

                  <div className="card-footer">
                    <button
                      type="button"
                      className="btn-use-suggestion"
                      onClick={() => onUseSuggestion(sug.content)}
                    >
                      <span className="use-icon">👉</span> Dùng câu này
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Policy reference accordion/box */}
        <div className="policy-reference-box">
          <div className="policy-title">📖 Sổ tay chính sách hỗ trợ</div>
          <ul className="policy-points">
            <li>
              <strong>Bảo lưu:</strong> Tối đa 90 ngày cho học viên bận công việc/công tác đột xuất.
            </li>
            <li>
              <strong>Bệnh hiểm nghèo:</strong> Duyệt hoàn 100% học phí 2.800.000đ ngay trong ngày làm việc.
            </li>
            <li>
              <strong>Phong cách Thầy Minh:</strong> Ấm áp, gọi &quot;em/anh/chị&quot;, khích lệ ngón đàn, không thúc ép.
            </li>
          </ul>
        </div>
      </div>
    </aside>
  );
};
