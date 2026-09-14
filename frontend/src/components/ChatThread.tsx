import React, { useRef, useEffect } from 'react';
import { Conversation, ConversationIntent } from '../types';

export interface ChatThreadProps {
  conversation?: Conversation;
  draftMessage: string;
  onDraftChange: (value: string) => void;
  onSendDemo: () => void;
  onCopyDraft: () => void;
  copySuccess?: boolean;
  isLoadingMessages?: boolean;
  isSendingDemo?: boolean;
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
  onSendDemo,
  onCopyDraft,
  copySuccess,
  isLoadingMessages,
  isSendingDemo
}) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (draftMessage.trim()) {
        onSendDemo();
      }
    }
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

          return (
            <div
              key={msg.id}
              className={`message-row ${isStudent ? 'row-student' : 'row-staff'}`}
            >
              {isStudent && (
                <div className="message-sender-avatar" title={conversation.studentName}>
                  {initials}
                </div>
              )}

              <div className={`message-bubble-wrapper ${isStudent ? 'student-wrapper' : 'staff-wrapper'}`}>
                <div className="message-sender-title">
                  {isStudent ? conversation.studentName : 'Thầy Minh (Bạn)'}
                </div>
                <div className={`message-bubble ${isStudent ? 'bubble-student' : 'bubble-staff'}`}>
                  {msg.text}
                </div>
                <div className="message-timestamp">{msg.sentAt}</div>
              </div>

              {!isStudent && (
                <div className="message-sender-avatar staff-avatar" title="Thầy Minh">
                  TM
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input / Composer Area */}
      <div className="chat-composer-area">
        <div className="composer-wrapper">
          <textarea
            className="composer-textarea"
            placeholder="Nhập nội dung phản hồi học viên (nhấn Ctrl + Enter để gửi demo)..."
            value={draftMessage}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
          />

          <div className="composer-bottom-bar">
            <div className="composer-hints">
              <span className="hint-text">💡 Dùng gợi ý AI từ cột bên phải hoặc tự soạn thảo</span>
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

              <button
                type="button"
                className="btn-action btn-send"
                onClick={onSendDemo}
                disabled={!draftMessage.trim() || isSendingDemo}
                title="Gửi tin nhắn thử nghiệm vào luồng hội thoại"
              >
                {isSendingDemo ? 'Đang lưu...' : 'Gửi demo ↵'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
