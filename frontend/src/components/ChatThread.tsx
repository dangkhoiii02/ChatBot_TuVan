import React, { useRef, useEffect, useState } from 'react';
import { Conversation, ConversationIntent } from '../types';

export interface ChatThreadProps {
  conversation?: Conversation;
  draftMessage: string;
  onDraftChange: (value: string) => void;
  onCopyDraft: () => void;
  copySuccess?: boolean;
  isLoadingMessages?: boolean;
  conflictDialog?: { isOpen: boolean; pendingContent: string };
  onResolveConflict?: (action: 'replace' | 'append' | 'cancel') => void;
  onOpenAssistantMobile?: () => void;
}

const INTENT_MAP: Record<ConversationIntent, { label: string; badgeClass: string }> = {
  check_in: {
    label: 'Check-in',
    badgeClass: 'intent-badge intent-check-in'
  },
  assignment_feedback: {
    label: 'Chấm bài',
    badgeClass: 'intent-badge intent-feedback'
  },
  sensitive: {
    label: 'Cần chú ý',
    badgeClass: 'intent-badge intent-sensitive'
  },
  unknown: {
    label: 'Chưa phân loại',
    badgeClass: 'intent-badge intent-unknown'
  }
};

export const ChatThread: React.FC<ChatThreadProps> = ({
  conversation,
  draftMessage,
  onDraftChange,
  onCopyDraft,
  copySuccess,
  isLoadingMessages,
  conflictDialog,
  onResolveConflict,
  onOpenAssistantMobile
}) => {
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const handleCopyMsg = (id: string, text: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Auto scroll to bottom when conversation or message list changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.id, conversation?.messages.length]);

  if (!conversation) {
    return (
      <main className="chat-thread-container empty-selection">
        <div className="empty-thread-placeholder">
          <div className="empty-icon">💬</div>
          <h3>Chưa chọn hội thoại</h3>
          <p>Vui lòng chọn một học viên từ danh sách bên trái để xem nội dung trò chuyện.</p>
        </div>
      </main>
    );
  }

  const intentInfo = INTENT_MAP[conversation.intent];
  const initials =
    conversation.avatar ||
    conversation.studentName
      .split(' ')
      .slice(-2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') e.preventDefault();
  };

  return (
    <main className="chat-thread-container">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          <div className={`student-avatar-header avatar-${conversation.intent}`}>
            {initials}
          </div>
          <div className="chat-header-info">
            <div className="chat-student-title">
              <h2 className="chat-student-name">{conversation.studentName}</h2>
              <span className={intentInfo.badgeClass}>{intentInfo.label}</span>
            </div>
            <div className="chat-student-status">
              <span className="status-indicator-dot" />
              <span>Hoạt động: {conversation.lastActiveAt}</span>
              {conversation.flagReason && (
                <span className="header-flag-tag">🚩 {conversation.flagReason}</span>
              )}
            </div>
          </div>
        </div>

        <div className="chat-header-actions">
          {onOpenAssistantMobile && (
            <button
              type="button"
              className="btn-toggle-assistant-mobile"
              onClick={onOpenAssistantMobile}
              title="Mở bảng Trợ lý AI"
            >
              ✨ Trợ lý AI
            </button>
          )}
          <span className="badge-channel">Pancake Demo</span>
        </div>
      </header>

      {/* Messages List */}
      <div className="chat-messages-area">
        <div className="chat-timeline-divider">
          <span>Hội thoại trực tiếp qua Fanpage Lớp Nhạc Thầy Minh</span>
        </div>

        {isLoadingMessages && (
          <div className="chat-loading-note">Đang tải lịch sử tin nhắn từ Pancake...</div>
        )}

        {conversation.messages.map((msg) => {
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="message-row row-system">
                <div className="message-bubble bubble-system">{msg.text}</div>
              </div>
            );
          }

          const isStudent = msg.sender === 'student';
          const senderLabel = msg.senderName?.trim() || (isStudent ? conversation.studentName : 'Thầy Minh (Bạn)');
          const senderInitials = senderLabel.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase();

          return (
            <div
              id={`message-${msg.id}`}
              key={msg.id}
              className={`message-row ${isStudent ? 'row-student' : 'row-staff'}`}
            >
              {isStudent && (
                <div className="message-sender-avatar" title={senderLabel}>
                  {senderInitials}
                </div>
              )}

              <div className={`message-bubble-wrapper ${isStudent ? 'student-wrapper' : 'staff-wrapper'}`}>
                <div className="message-sender-title">
                  {senderLabel}
                </div>
                <div className={`message-bubble ${isStudent ? 'bubble-student' : 'bubble-staff'}`}>
                  {msg.text}
                </div>
                <div className="message-meta-row">
                  <span className="message-timestamp">{msg.sentAt}</span>
                  <button
                    type="button"
                    className={`btn-msg-copy ${copiedMsgId === msg.id ? 'copied' : ''}`}
                    onClick={() => handleCopyMsg(msg.id, msg.text)}
                    title="Sao chép tin nhắn này"
                  >
                    {copiedMsgId === msg.id ? '✓ Đã copy' : '📋 Copy'}
                  </button>
                </div>
              </div>

              {!isStudent && (
                <div className="message-sender-avatar staff-avatar" title={senderLabel}>
                  {senderInitials}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input / Composer Area */}
      <div className="chat-composer-area">
        {/* Banner xung đột bản nháp đã sửa tay */}
        {conflictDialog?.isOpen && (
          <div className="draft-conflict-banner">
            <div className="conflict-prompt">
              <span className="conflict-icon">⚠️</span>
              <div className="conflict-text">
                <strong>Bản nháp đã có nội dung sửa tay:</strong>
                <span>Bạn muốn áp dụng câu gợi ý mới như thế nào?</span>
              </div>
            </div>
            <div className="conflict-actions">
              <button
                type="button"
                className="btn-conflict-action btn-replace"
                onClick={() => onResolveConflict?.('replace')}
              >
                Ghi đè toàn bộ
              </button>
              <button
                type="button"
                className="btn-conflict-action btn-append"
                onClick={() => onResolveConflict?.('append')}
              >
                Chèn thêm vào cuối
              </button>
              <button
                type="button"
                className="btn-conflict-action btn-cancel"
                onClick={() => onResolveConflict?.('cancel')}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        <div className="composer-wrapper">
          <div className="composer-top-bar">
            <span className="composer-title">✍️ Soạn thảo phản hồi học viên</span>
            <div className="composer-top-actions">
              {draftMessage && (
                <button
                  type="button"
                  className="btn-clear-draft"
                  onClick={() => onDraftChange('')}
                  title="Xóa sạch nội dung ô nháp"
                >
                  ✕ Xóa trắng
                </button>
              )}
              <span className="char-count">{draftMessage.length} ký tự</span>
            </div>
          </div>

          <textarea
            className="composer-textarea"
            placeholder="Nhập hoặc chỉnh nội dung, sau đó sao chép sang Pancake…"
            value={draftMessage}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
          />

          <div className="composer-bottom-bar">
            <div className="composer-hints">
              <span className="hint-text">
                Sao chép nội dung và kiểm tra lại trước khi gửi trên Pancake.
              </span>
            </div>

            <div className="composer-buttons">
              <button
                type="button"
                className={`btn-action btn-copy ${copySuccess ? 'btn-copied' : ''}`}
                onClick={onCopyDraft}
                disabled={!draftMessage.trim()}
                title="Sao chép nội dung vào Clipboard để dán vào Pancake"
              >
                {copySuccess ? '✓ Đã copy!' : '📋 Sao chép'}
              </button>

            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
