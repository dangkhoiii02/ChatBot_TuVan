import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  BackendChatMessage,
  BackendConversationSummary,
  BackendHealth,
  BackendPageSummary,
  ChatMessage,
  Conversation,
  ConversationIntent,
  PancakePage
} from './types';
import { ConversationSidebar } from './components/ConversationSidebar';
import { ChatThread } from './components/ChatThread';
import { SuggestionPanel } from './components/SuggestionPanel';
import { PageSelector } from './components/PageSelector';
import {
  createSuggestions,
  getConversationMessages,
  getConversations,
  getHealth,
  getPages,
  saveDemoReply
} from './services/api';

const CONVERSATION_LIMIT = 30;
const MESSAGE_LIMIT = 30;

export const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [pages, setPages] = useState<PancakePage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState<boolean>(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSendingDemo, setIsSendingDemo] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const hasLoadedPagesRef = useRef(false);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId),
    [conversations, selectedId]
  );

  const pageNameById = useMemo(
    () => new Map(pages.map((page) => [page.id, page.name])),
    [pages]
  );

  const refreshConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    setErrorMessage('');

    try {
      if (!selectedPageIds.length) {
        setConversations([]);
        setSelectedId('');
        return;
      }

      const items = await getConversations(selectedPageIds, CONVERSATION_LIMIT);
      const mapped = items.map((item) => mapConversationSummary(item, pageNameById));

      setConversations((current) => {
        const currentById = new Map(current.map((item) => [item.id, item]));

        return mapped.map((item) => {
          const existing = currentById.get(item.id);
          return {
            ...item,
            intent: existing?.intent && existing.intent !== 'unknown' ? existing.intent : item.intent,
            messages: existing?.messages || [],
            suggestions: existing?.suggestions || [],
            flagReason: existing?.flagReason || item.flagReason,
            aiAnalysis: existing?.aiAnalysis || item.aiAnalysis,
            aiProvider: existing?.aiProvider || item.aiProvider,
            isDemoFallback: existing?.isDemoFallback || item.isDemoFallback
          };
        });
      });

      setSelectedId((currentId) => {
        if (currentId && mapped.some((item) => item.id === currentId)) return currentId;
        return mapped[0]?.id || '';
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoadingConversations(false);
    }
  }, [pageNameById, selectedPageIds]);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((error) => setErrorMessage(getErrorMessage(error)));

  }, []);

  useEffect(() => {
    if (hasLoadedPagesRef.current) return;
    hasLoadedPagesRef.current = true;

    let isCurrent = true;

    setIsLoadingPages(true);
    setErrorMessage('');

    getPages()
      .then((data) => {
        if (!isCurrent) return;

        const mappedPages = data.items.map(mapPageSummary);
        const pageIds = new Set(mappedPages.map((page) => page.id));
        const defaultSelectedPageIds = data.defaultSelectedPageIds.filter((pageId) => pageIds.has(pageId));

        setPages(mappedPages);
        setSelectedPageIds(
          defaultSelectedPageIds.length ? defaultSelectedPageIds : mappedPages.slice(0, 1).map((page) => page.id)
        );
      })
      .catch((error) => {
        if (isCurrent) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingPages(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (!selectedId || !selectedConversation?.pageId) return;

    let isCurrent = true;
    setIsLoadingMessages(true);
    setErrorMessage('');

    getConversationMessages(selectedId, selectedConversation.pageId, MESSAGE_LIMIT)
      .then((items) => {
        if (!isCurrent) return;
        const messages = items.slice().reverse().map(mapChatMessage);

        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === selectedId
              ? {
                  ...conversation,
                  messages
                }
              : conversation
          )
        );
      })
      .catch((error) => {
        if (isCurrent) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingMessages(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedConversation?.pageId, selectedId]);

  const handlePageSelectionChange = useCallback((pageIds: string[]) => {
    setSelectedPageIds(pageIds);
    setSelectedId('');
    setConversations([]);
    setDraftMessage('');
    setCopySuccess(false);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedId(id);
    setCopySuccess(false);
    setDraftMessage('');

    setConversations((prev) =>
      prev.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleSendDemo = useCallback(async () => {
    if (!draftMessage.trim() || !selectedConversation || isSendingDemo) return;

    setIsSendingDemo(true);
    setErrorMessage('');

    try {
      const savedReply = await saveDemoReply({
        conversationId: selectedConversation.id,
        content: draftMessage.trim()
      });

      const newMsg: ChatMessage = {
        id: savedReply.id,
        sender: 'staff',
        text: savedReply.content,
        sentAt: `${formatTimestamp(savedReply.createdAt)} (Demo)`,
        createdAt: savedReply.createdAt
      };

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === selectedConversation.id) {
            return {
              ...conv,
              messages: [...conv.messages, newMsg],
              lastMessage: newMsg.text,
              lastActiveAt: 'Vừa xong'
            };
          }
          return conv;
        })
      );

      setDraftMessage('');
      setCopySuccess(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSendingDemo(false);
    }
  }, [draftMessage, isSendingDemo, selectedConversation]);

  const handleCopyDraft = useCallback(() => {
    if (!draftMessage.trim()) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(draftMessage)
        .then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        })
        .catch(() => {
          fallbackCopy(draftMessage, setCopySuccess);
        });
    } else {
      fallbackCopy(draftMessage, setCopySuccess);
    }
  }, [draftMessage]);

  const handleUseSuggestion = useCallback((content: string) => {
    setDraftMessage(content);
    setCopySuccess(false);
  }, []);

  const handleGenerateSuggestions = useCallback(async () => {
    if (!selectedConversation || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage('');

    try {
      const result = await createSuggestions({
        conversationId: selectedConversation.id,
        messages: selectedConversation.messages
      });

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                intent: result.intent,
                flagReason:
                  result.flagReason ||
                  (result.sensitivity === 'do'
                    ? 'AI đánh dấu cờ đỏ từ lịch sử hội thoại'
                    : conversation.flagReason),
                aiAnalysis: result.analysis,
                aiProvider: result.provider,
                isDemoFallback: result.isDemoFallback,
                suggestions: result.suggestions.map((suggestion) => ({
                  ...suggestion,
                  sensitivity: result.sensitivity
                }))
              }
            : conversation
        )
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, selectedConversation]);

  return (
    <div className="app-container">
      <header className="app-navbar">
        <div className="navbar-brand">
          <span className="brand-logo">🎹</span>
          <div className="brand-titles">
            <h1 className="brand-name">Lớp Nhạc Thầy Minh</h1>
            <span className="brand-tagline">AI Copilot Hỗ trợ phản hồi Pancake</span>
          </div>
        </div>

        <div className="navbar-status-badges">
          <PageSelector
            pages={pages}
            selectedPageIds={selectedPageIds}
            isLoading={isLoadingPages}
            onChange={handlePageSelectionChange}
          />
          <span className="badge-status-pill badge-active">
            <span className="dot-green" /> API Demo
          </span>
          <span className="badge-status-pill">{conversations.length} hội thoại Pancake</span>
          {health && <span className="badge-status-pill">AI: {health.aiProvider}</span>}
          {errorMessage && <span className="badge-status-pill badge-error">Lỗi: {errorMessage}</span>}
        </div>
      </header>

      <div className="app-main-layout">
        <ConversationSidebar
          conversations={conversations}
          selectedId={selectedId}
          onSelect={handleSelectConversation}
          onRefresh={refreshConversations}
          isLoading={isLoadingConversations}
          errorMessage={errorMessage}
          showPageName={selectedPageIds.length > 1}
        />

        <ChatThread
          conversation={selectedConversation}
          draftMessage={draftMessage}
          onDraftChange={setDraftMessage}
          onSendDemo={handleSendDemo}
          onCopyDraft={handleCopyDraft}
          copySuccess={copySuccess}
          isLoadingMessages={isLoadingMessages}
          isSendingDemo={isSendingDemo}
        />

        <SuggestionPanel
          conversation={selectedConversation}
          suggestions={selectedConversation?.suggestions || []}
          isGenerating={isGenerating}
          onGenerate={handleGenerateSuggestions}
          onUseSuggestion={handleUseSuggestion}
        />
      </div>
    </div>
  );
};

function mapPageSummary(item: BackendPageSummary): PancakePage {
  return {
    id: item.id,
    name: item.name || 'Pancake page',
    platform: item.platform,
    avatarUrl: item.avatarUrl
  };
}

function mapConversationSummary(
  item: BackendConversationSummary,
  pageNameById: Map<string, string>
): Conversation {
  return {
    id: item.id,
    pageId: item.pageId,
    pageName: item.pageName || pageNameById.get(item.pageId),
    studentName: item.customerName || 'Khách hàng Pancake',
    lastMessage: item.lastMessage || 'Chưa có nội dung tin nhắn',
    lastActiveAt: formatTimestamp(item.updatedAt),
    intent: inferIntent(item.lastMessage),
    unreadCount: item.unreadCount || 0,
    messages: [],
    suggestions: []
  };
}

function mapChatMessage(message: BackendChatMessage): ChatMessage {
  return {
    id: message.id,
    sender: message.sender,
    text: message.text || getAttachmentText(message.attachments),
    sentAt: formatTimestamp(message.createdAt),
    createdAt: message.createdAt,
    attachments: message.attachments
  };
}

function inferIntent(text: string): ConversationIntent {
  const normalized = normalizeText(text);

  if (
    ['ung thu', 'nam vien', 'hoa tri', 'tram cam', 'muon nghi', 'hoan tien', 'mat nguoi than'].some(
      (keyword) => normalized.includes(keyword)
    )
  ) {
    return 'sensitive';
  }

  if (
    ['clip', 'video', 'bai tap', 'ngon', 'phim', 'rotation', 'vung', 'vap'].some((keyword) =>
      normalized.includes(keyword)
    )
  ) {
    return 'assignment_feedback';
  }

  if (text.trim()) return 'check_in';
  return 'unknown';
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Không rõ';

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}

function getAttachmentText(attachments: BackendChatMessage['attachments']) {
  if (!attachments.length) return '[Tin nhắn không có nội dung text]';
  return `[${attachments.length} tệp đính kèm]`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra';
}

function fallbackCopy(text: string, setCopySuccess: (value: boolean) => void) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  } catch {
    setCopySuccess(false);
  }
}

export default App;
