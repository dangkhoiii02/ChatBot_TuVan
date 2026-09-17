import React, { useState, useMemo } from 'react';
import { Conversation, ConversationIntent } from '../types';

export interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  errorMessage?: string;
  showPageName?: boolean;
}

type FilterIntent = 'all' | ConversationIntent;

const INTENT_LABELS: Record<ConversationIntent, { label: string; badgeClass: string }> = {
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

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  selectedId,
  onSelect,
  onRefresh,
  isLoading,
  errorMessage,
  showPageName
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterIntent, setFilterIntent] = useState<FilterIntent>('all');

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const matchesSearch =
        conv.studentName.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase().trim());

      const matchesIntent = filterIntent === 'all' || conv.intent === filterIntent;

      return matchesSearch && matchesIntent;
    });
  }, [conversations, searchTerm, filterIntent]);

  const counts = useMemo(() => {
    return {
      all: conversations.length,
      check_in: conversations.filter((c) => c.intent === 'check_in').length,
      assignment_feedback: conversations.filter((c) => c.intent === 'assignment_feedback').length,
      sensitive: conversations.filter((c) => c.intent === 'sensitive').length
    };
  }, [conversations]);

  return (
    <aside className="conversation-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <h2 className="sidebar-title">Học viên</h2>
          <div className="sidebar-title-actions">
            <span className="sidebar-total-badge">{conversations.length} hội thoại</span>
            {onRefresh && (
              <button
                type="button"
                className="btn-refresh-sidebar"
                onClick={onRefresh}
                disabled={isLoading}
                title="Làm mới danh sách từ Pancake"
              >
                {isLoading ? 'Đang tải...' : 'Làm mới'}
              </button>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="sidebar-search-box">
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Tìm theo tên học viên, tin nhắn..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchTerm('')}
              title="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter buttons with live counts */}
        <div className="sidebar-filter-tabs">
          <button
            type="button"
            className={`filter-tab ${filterIntent === 'all' ? 'active' : ''}`}
            onClick={() => setFilterIntent('all')}
          >
            Tất cả <span className="tab-count">({counts.all})</span>
          </button>
          <button
            type="button"
            className={`filter-tab ${filterIntent === 'check_in' ? 'active' : ''}`}
            onClick={() => setFilterIntent('check_in')}
          >
            Check-in <span className="tab-count">({counts.check_in})</span>
          </button>
          <button
            type="button"
            className={`filter-tab ${filterIntent === 'assignment_feedback' ? 'active' : ''}`}
            onClick={() => setFilterIntent('assignment_feedback')}
          >
            Chấm bài <span className="tab-count">({counts.assignment_feedback})</span>
          </button>
          <button
            type="button"
            className={`filter-tab ${filterIntent === 'sensitive' ? 'active sensitive' : ''}`}
            onClick={() => setFilterIntent('sensitive')}
          >
            Cần chú ý <span className="tab-count count-alert">({counts.sensitive})</span>
          </button>
        </div>

        {errorMessage && <div className="sidebar-error-note">{errorMessage}</div>}
      </div>

      {/* Conversation List */}
      <div className="sidebar-list">
        {isLoading && conversations.length === 0 ? (
          <div className="sidebar-empty">Đang tải hội thoại từ Pancake...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="sidebar-empty">Không tìm thấy hội thoại phù hợp</div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === selectedId;
            const intentInfo = INTENT_LABELS[conv.intent];
            const initials =
              conv.avatar ||
              conv.studentName
                .split(' ')
                .slice(-2)
                .map((n) => n[0])
                .join('')
                .toUpperCase();

            return (
              <div
                key={conv.id}
                className={`conversation-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(conv.id);
                  }
                }}
              >
                <div className={`student-avatar avatar-${conv.intent}`}>
                  {initials}
                </div>

                <div className="conversation-content">
                  <div className="conversation-top-row">
                    <span className="student-name-block">
                      <span className="student-name">{conv.studentName}</span>
                      {showPageName && conv.pageName && (
                        <span className="conversation-page-name">{conv.pageName}</span>
                      )}
                    </span>
                    <span className="last-active-time">{conv.lastActiveAt}</span>
                  </div>

                  <p className="last-message-preview">{conv.lastMessage}</p>

                  <div className="conversation-bottom-row">
                    <span className={intentInfo.badgeClass}>{intentInfo.label}</span>

                    {conv.unreadCount > 0 && (
                      <span className="unread-badge">{conv.unreadCount}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
