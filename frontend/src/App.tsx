import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  BackendChatMessage,
  BackendConversationSummary,
  BackendHealth,
  BackendPageSummary,
  ChatMessage,
  Conversation,
  ConversationIntent,
  CustomField,
  PancakePage,
  PronounPair,
  AssignmentReviewOption,
  MemoryItem
} from './types';
import { ConversationSidebar } from './components/ConversationSidebar';
import { ChatThread } from './components/ChatThread';
import { SuggestionPanel } from './components/SuggestionPanel';
import { PageSelector } from './components/PageSelector';
import { mockConversations, demoPages } from './mock/conversations';
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
  // Initialize with rich mock conversations for immediate usability
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [selectedId, setSelectedId] = useState<string>('conv-1');
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [pages, setPages] = useState<PancakePage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState<boolean>(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSendingDemo, setIsSendingDemo] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isMockMode, setIsMockMode] = useState<boolean>(true);
  const hasLoadedPagesRef = useRef(false);

  // New states for Assistant features
  const [currentPronouns, setCurrentPronouns] = useState<PronounPair>({
    recipientCall: 'Em',
    senderCall: 'Thầy',
    label: 'Thầy — Em'
  });

  const [conflictDialog, setConflictDialog] = useState<{
    isOpen: boolean;
    pendingContent: string;
  }>({
    isOpen: false,
    pendingContent: ''
  });

  const [mobileView, setMobileView] = useState<'conversations' | 'chat' | 'assistant'>('chat');

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId),
    [conversations, selectedId]
  );

  // Synchronize pronouns when switching conversation
  useEffect(() => {
    if (!selectedConversation) return;
    if (selectedConversation.profile?.recipientCall && selectedConversation.profile?.senderCall) {
      const r = selectedConversation.profile.recipientCall;
      const s = selectedConversation.profile.senderCall;
      setCurrentPronouns({
        recipientCall: r,
        senderCall: s,
        label: `${s} — ${r}`
      });
    } else if (selectedConversation.studentName.toLowerCase().startsWith('chị')) {
      setCurrentPronouns({ recipientCall: 'Chị', senderCall: 'Em', label: 'Em — Chị' });
    } else if (selectedConversation.studentName.toLowerCase().startsWith('anh')) {
      setCurrentPronouns({ recipientCall: 'Anh', senderCall: 'Thầy', label: 'Thầy — Anh' });
    } else {
      setCurrentPronouns({ recipientCall: 'Em', senderCall: 'Thầy', label: 'Thầy — Em' });
    }
  }, [selectedConversation?.id]);

  const pageNameById = useMemo(
    () => new Map(pages.map((page) => [page.id, page.name])),
    [pages]
  );

  const refreshConversations = useCallback(async () => {
    if (!selectedPageIds.length) return;

    setIsLoadingConversations(true);
    setErrorMessage('');

    try {
      if (isMockMode) {
        setConversations(mockConversations);
        setSelectedId((currentId) => {
          if (currentId && mockConversations.some((item) => item.id === currentId)) return currentId;
          return mockConversations[0]?.id || '';
        });
        return;
      }

      if (!selectedPageIds.length) {
        setConversations([]);
        setSelectedId('');
        return;
      }

      const items = await getConversations(selectedPageIds, CONVERSATION_LIMIT);
      if (items && items.length > 0) {
        const mapped = items.map((item) => mapConversationSummary(item, pageNameById));

        setConversations((current) => {
          const currentById = new Map(current.map((item) => [item.id, item]));

          return mapped.map((item) => {
            const existing = currentById.get(item.id);
            return {
              ...item,
              intent: existing?.intent && existing.intent !== 'unknown' ? existing.intent : item.intent,
              messages: existing?.messages && existing.messages.length > 0 ? existing.messages : item.messages,
              suggestions: existing?.suggestions && existing.suggestions.length > 0 ? existing.suggestions : item.suggestions,
              flagReason: existing?.flagReason || item.flagReason,
              aiAnalysis: existing?.aiAnalysis || item.aiAnalysis,
              aiProvider: existing?.aiProvider || item.aiProvider,
              isDemoFallback: existing?.isDemoFallback || item.isDemoFallback,
              profile: existing?.profile || item.profile,
              memories: existing?.memories || item.memories,
              assignmentOptions: existing?.assignmentOptions || item.assignmentOptions
            };
          });
        });

        setSelectedId((currentId) => {
          if (currentId && mapped.some((item) => item.id === currentId)) return currentId;
          return mapped[0]?.id || '';
        });
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      // Tự động chuyển sang Chế độ Mock Test khi gọi API thất bại
      setIsMockMode(true);
      setPages(demoPages);
      setSelectedPageIds(['demo-page']);
      setConversations(mockConversations);
      setSelectedId(mockConversations[0]?.id || '');
      // Keep mock conversations on API error so UI remains fully functional
      console.warn('Backend conversations unavailable, using mock data:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [isMockMode, pageNameById, selectedPageIds]);

  const toggleMockMode = useCallback(() => {
    setIsMockMode((prev) => {
      const next = !prev;
      if (next) {
        setPages(demoPages);
        setSelectedPageIds(['demo-page']);
        setConversations(mockConversations);
        setSelectedId(mockConversations[0]?.id || '');
      } else {
        refreshConversations();
      }
      return next;
    });
  }, [refreshConversations]);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((error) => {
        setErrorMessage(getErrorMessage(error));
        // Fallback health state for offline/demo
        setHealth({
          ok: true,
          service: 'frontend-demo',
          pancakeConfigured: false,
          pancakeAuthMode: 'missing',
          aiProvider: 'Mock Assistant Thầy Minh'
        });
      });
  }, []);

  useEffect(() => {
    if (hasLoadedPagesRef.current || isMockMode) return;
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
        // Provide demo page if backend is offline
        if (isCurrent) {
          setErrorMessage(getErrorMessage(error));
          // Auto fallback sang demoPages và mockConversations khi getPages lỗi
          setIsMockMode(true);
          setPages(demoPages);
          setSelectedPageIds(['demo-page']);
          setConversations(mockConversations);
          setSelectedId(mockConversations[0]?.id || '');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingPages(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isMockMode]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (!selectedId || !selectedConversation?.pageId || isMockMode || selectedConversation.pageId === 'demo-page') return;

    let isCurrent = true;
    setIsLoadingMessages(true);
    setErrorMessage('');

    getConversationMessages(selectedId, selectedConversation.pageId, MESSAGE_LIMIT)
      .then((items) => {
        if (!isCurrent) return;
        const messages = items
          .map(mapChatMessage)
          .sort((a, b) => {
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          });

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
    setMobileView('chat');

    setConversations((prev) =>
      prev.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleSendDemo = useCallback(async () => {
    if (!draftMessage.trim() || !selectedConversation || isSendingDemo) return;

    setIsSendingDemo(true);
    setErrorMessage('');

    try {
      let newMsg: ChatMessage;

      if (selectedConversation.pageId === 'demo-page' || !health?.pancakeConfigured) {
        // Local demo mode: generate instant local reply
        newMsg = {
          id: `msg-demo-${Date.now()}`,
          sender: 'staff',
          text: draftMessage.trim(),
          sentAt: `${formatTimestamp(new Date().toISOString())} (Demo)`,
          createdAt: new Date().toISOString()
        };
      } else {
        const savedReply = await saveDemoReply({
          conversationId: selectedConversation.id,
          content: draftMessage.trim()
        });

        newMsg = {
          id: savedReply.id,
          sender: 'staff',
          text: savedReply.content,
          sentAt: `${formatTimestamp(savedReply.createdAt)} (Demo)`,
          createdAt: savedReply.createdAt
        };
      }

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
  }, [draftMessage, health?.pancakeConfigured, isSendingDemo, selectedConversation]);

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

  // Handle applying a suggestion with draft conflict detection
  const handleUseSuggestion = useCallback((content: string) => {
    const trimmedDraft = draftMessage.trim();
    if (!trimmedDraft) {
      setDraftMessage(content);
      setCopySuccess(false);
      setMobileView('chat');
      return;
    }

    if (trimmedDraft === content.trim()) {
      setMobileView('chat');
      return;
    }

    // Conflict: user already typed text in draft
    setConflictDialog({
      isOpen: true,
      pendingContent: content
    });
    setMobileView('chat');
  }, [draftMessage]);

  const handleResolveConflict = useCallback((action: 'replace' | 'append' | 'cancel') => {
    if (action === 'replace') {
      setDraftMessage(conflictDialog.pendingContent);
    } else if (action === 'append') {
      setDraftMessage((prev) => `${prev.trim()}\n\n${conflictDialog.pendingContent}`);
    }
    setConflictDialog({ isOpen: false, pendingContent: '' });
    setCopySuccess(false);
  }, [conflictDialog]);

  // Quick Pronoun Changing with Instant Suggestion Adaptation
  const handleChangePronouns = useCallback((newPair: PronounPair) => {
    const oldPair = currentPronouns;
    setCurrentPronouns(newPair);

    if (!selectedConversation) return;

    const adaptText = (text: string) => {
      let result = text;
      if (oldPair.senderCall !== newPair.senderCall && oldPair.senderCall) {
        result = result.split(oldPair.senderCall).join(newPair.senderCall);
      }
      if (oldPair.recipientCall !== newPair.recipientCall && oldPair.recipientCall) {
        result = result.split(oldPair.recipientCall).join(newPair.recipientCall);
        result = result.split(oldPair.recipientCall.toLowerCase()).join(newPair.recipientCall.toLowerCase());
      }
      return result;
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === selectedConversation.id) {
          const updatedSuggestions = (c.suggestions || []).map((s) => ({
            ...s,
            content: adaptText(s.content)
          }));
          const updatedAssignmentOptions = (c.assignmentOptions || []).map((o) => ({
            ...o,
            content: adaptText(o.content)
          }));
          const updatedProfile = c.profile
            ? {
                ...c.profile,
                recipientCall: newPair.recipientCall,
                senderCall: newPair.senderCall,
                fields: c.profile.fields.map((f) => {
                  if (f.key === 'sender') return { ...f, value: newPair.senderCall };
                  if (f.key === 'recipient') return { ...f, value: `${newPair.recipientCall} ${c.studentName.replace(/^(Em|Chị|Anh|Bạn)\s*/i, '')}` };
                  return f;
                })
              }
            : undefined;

          return {
            ...c,
            suggestions: updatedSuggestions,
            assignmentOptions: updatedAssignmentOptions,
            profile: updatedProfile
          };
        }
        return c;
      })
    );
  }, [currentPronouns, selectedConversation]);

  // Fast Pedagogical Assignment Review Generator
  const handleGradeAssignment = useCallback((reviewText: string) => {
    if (!selectedConversation) return;
    const s = currentPronouns.senderCall;
    const r = currentPronouns.recipientCall;

    const generatedOptions: AssignmentReviewOption[] = [
      {
        id: `asg_${Date.now()}_1`,
        tone: 'Sư phạm & Kỹ thuật',
        content: `${s} xem clip và nhận thấy nè ${r}! ${reviewText}. ${r} tập trung thả lỏng cổ tay và tập chậm lại từng ô nhịp nhé!`,
        usedFacts: ['Lỗi kỹ thuật', 'Thả lỏng cổ tay', 'Tập chậm']
      },
      {
        id: `asg_${Date.now()}_2`,
        tone: 'Nhẹ nhàng & Khích lệ',
        content: `Tiếng đàn tuần này của ${r} tiến bộ hơn rồi nè! Chỉ cần lưu ý thêm: ${reviewText}. Cố lên nghen ${r} ơi, sắp thành thạo bài rồi nè 🥰`,
        usedFacts: ['Tiếng đàn tiến bộ', 'Khích lệ tập luyện']
      },
      {
        id: `asg_${Date.now()}_3`,
        tone: 'Ngắn gọn & Trọng tâm',
        content: `${r} tập trung chỉnh sửa: ${reviewText}. Giữ tempo 50 và lặp lại 5-7 lượt mỗi ngày nha.`,
        usedFacts: ['Trọng tâm chỉnh sửa', 'Tempo 50']
      }
    ];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConversation.id
          ? {
              ...c,
              assignmentOptions: generatedOptions
            }
          : c
      )
    );
  }, [currentPronouns, selectedConversation]);

  // Add Custom Field to Student Profile
  const handleAddCustomField = useCallback((field: Omit<CustomField, 'id' | 'source'>) => {
    if (!selectedConversation) return;
    const newField: CustomField = {
      ...field,
      id: `cf_${Date.now()}`,
      source: 'user_input'
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === selectedConversation.id) {
          const currentProfile = c.profile || {
            recipientCall: currentPronouns.recipientCall,
            senderCall: currentPronouns.senderCall,
            nextAction: 'Chờ phản hồi từ học viên',
            specialNotes: '',
            studyNotes: '',
            dataStatus: 'saved',
            fields: [],
            customFields: []
          };
          return {
            ...c,
            profile: {
              ...currentProfile,
              customFields: [...(currentProfile.customFields || []), newField]
            }
          };
        }
        return c;
      })
    );
  }, [currentPronouns, selectedConversation]);

  // Accept AI Suggested Field in Profile
  const handleAcceptAiProfileSuggestion = useCallback((fieldKey: string, newValue: string) => {
    if (!selectedConversation) return;

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === selectedConversation.id && c.profile) {
          const updatedFields = c.profile.fields.map((f) =>
            f.key === fieldKey
              ? { ...f, value: newValue, source: 'confirmed' as const, aiSuggestion: undefined, conflictReason: undefined }
              : f
          );
          const hasConflict = updatedFields.some((f) => f.source === 'conflict');
          return {
            ...c,
            profile: {
              ...c.profile,
              fields: updatedFields,
              dataStatus: hasConflict ? ('conflict' as const) : ('saved' as const)
            }
          };
        }
        return c;
      })
    );
  }, [selectedConversation]);

  // Save new memory item or apply suggested memory
  const handleSaveMemory = useCallback((content: string, reason?: string) => {
    if (!selectedConversation) return;

    const newMem: MemoryItem = {
      id: `mem_${Date.now()}`,
      content,
      status: 'active',
      reason,
      createdAt: 'Vừa xong'
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === selectedConversation.id) {
          const existing = (c.memories || []).filter((m) => m.content !== content);
          return {
            ...c,
            memories: [newMem, ...existing]
          };
        }
        return c;
      })
    );
  }, [selectedConversation]);

  const handleGenerateSuggestions = useCallback(async () => {
    if (!selectedConversation || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage('');

    try {
      if (isMockMode || selectedConversation.pageId === 'demo-page' || !health?.pancakeConfigured) {
        const mockItem = mockConversations.find((c) => c.id === selectedConversation.id);
        if (mockItem && mockItem.suggestions.length > 0) {
          setConversations((current) =>
            current.map((conversation) =>
              conversation.id === selectedConversation.id
                ? {
                    ...conversation,
                    intent: mockItem.intent,
                    flagReason: mockItem.flagReason || conversation.flagReason,
                    suggestions: mockItem.suggestions,
                    aiProvider: 'mock',
                    isDemoFallback: true
                  }
                : conversation
            )
          );
          return;
        }

        // Quick local generator nếu không có mock item
        await new Promise((res) => setTimeout(res, 400));
        setConversations((current) =>
          current.map((c) =>
            c.id === selectedConversation.id
              ? {
                  ...c,
                  suggestions: [
                    {
                      id: `sug_${Date.now()}_1`,
                      tone: 'Nhẹ nhàng & Tình cảm',
                      sensitivity: c.intent === 'sensitive' ? 'do' : 'xanh',
                      content: `Dạ ${currentPronouns.senderCall} chào ${currentPronouns.recipientCall}! ${currentPronouns.senderCall} có xem qua tin nhắn rồi nè, ${currentPronouns.recipientCall} cứ yên tâm nha, bài học lớp mình luôn đồng hành cùng ${currentPronouns.recipientCall} ^^`,
                      usedFacts: ['Đồng hành bài học', 'Thấu hiểu học viên']
                    },
                    {
                      id: `sug_${Date.now()}_2`,
                      tone: 'Rõ việc cần làm',
                      sensitivity: c.intent === 'sensitive' ? 'do' : 'xanh',
                      content: `${currentPronouns.recipientCall} ơi, việc quan trọng nhất là ${c.profile?.nextAction || 'chăm sóc sức khỏe và luyện ngón đều tay'}. ${currentPronouns.recipientCall} nhắn lại cho ${currentPronouns.senderCall} sớm nhé!`,
                      usedFacts: ['Việc cần làm tiếp', 'Phản hồi sớm']
                    },
                    {
                      id: `sug_${Date.now()}_3`,
                      tone: 'Thân mật & Khích lệ',
                      sensitivity: c.intent === 'sensitive' ? 'do' : 'xanh',
                      content: `${currentPronouns.recipientCall} cố lên nghen! Dù bận hay khó khăn gì thì chỉ cần 10-15 phút rảnh là lướt ngón xả stress được rồi nè 🥰`,
                      usedFacts: ['10-15 phút xả stress']
                    }
                  ]
                }
              : c
          )
        );
        return;
      }

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
      // Khi API gợi ý lỗi thì fallback sang gợi ý mock của học viên
      const mockItem = mockConversations.find((c) => c.id === selectedConversation.id);
      if (mockItem && mockItem.suggestions.length > 0) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === selectedConversation.id
              ? {
                  ...conversation,
                  intent: mockItem.intent,
                  flagReason: mockItem.flagReason || conversation.flagReason,
                  suggestions: mockItem.suggestions,
                  aiProvider: 'mock (offline)',
                  isDemoFallback: true
                }
              : conversation
          )
        );
      } else {
        setErrorMessage(getErrorMessage(error));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [currentPronouns, health?.pancakeConfigured, isGenerating, selectedConversation]);

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
          <button
            type="button"
            className={`btn-mode-toggle ${isMockMode ? 'btn-mock-active' : ''}`}
            onClick={toggleMockMode}
            title={isMockMode ? 'Bấm để thử chuyển sang Live API' : 'Bấm để chuyển sang Chế độ Mock Test'}
          >
            <span className={`dot-status ${isMockMode ? 'dot-amber' : 'dot-green'}`} />
            {isMockMode ? 'Chế độ: Mock Test (6 học viên)' : 'Chế độ: Live API'}
          </button>
          <span className="badge-status-pill">{conversations.length} hội thoại</span>
          {health && <span className="badge-status-pill">AI: {health.aiProvider}</span>}
          {errorMessage && <span className="badge-status-pill badge-error">Lỗi: {errorMessage}</span>}
        </div>
      </header>

      <div className={`app-main-layout mobile-view-${mobileView}`}>
        {/* CỘT 1: DANH SÁCH HỘI THOẠI */}
        <div className={`layout-col col-sidebar ${mobileView === 'conversations' ? 'mobile-active' : ''}`}>
          <ConversationSidebar
            conversations={conversations}
            selectedId={selectedId}
            onSelect={handleSelectConversation}
            onRefresh={refreshConversations}
            isLoading={isLoadingConversations}
            errorMessage={errorMessage}
            showPageName={selectedPageIds.length > 1}
          />
        </div>

        {/* CỘT 2: LUỒNG CHAT & KHUNG SOẠN */}
        <div className={`layout-col col-chat ${mobileView === 'chat' ? 'mobile-active' : ''}`}>
          <ChatThread
            conversation={selectedConversation}
            draftMessage={draftMessage}
            onDraftChange={setDraftMessage}
            onSendDemo={handleSendDemo}
            onCopyDraft={handleCopyDraft}
            copySuccess={copySuccess}
            isLoadingMessages={isLoadingMessages}
            isSendingDemo={isSendingDemo}
            conflictDialog={conflictDialog}
            onResolveConflict={handleResolveConflict}
            onOpenAssistantMobile={() => setMobileView('assistant')}
          />
        </div>

        {/* CỘT 3: BẢNG TRỢ LÝ AI (4 TABS) */}
        <div className={`layout-col col-assistant ${mobileView === 'assistant' ? 'mobile-active' : ''}`}>
          <SuggestionPanel
            conversation={selectedConversation}
            suggestions={selectedConversation?.suggestions || []}
            isGenerating={isGenerating}
            onGenerate={handleGenerateSuggestions}
            onUseSuggestion={handleUseSuggestion}
            currentPronoun={currentPronouns}
            onChangePronouns={handleChangePronouns}
            onGradeAssignment={handleGradeAssignment}
            onAddCustomField={handleAddCustomField}
            onAcceptAiProfileSuggestion={handleAcceptAiProfileSuggestion}
            onSaveMemory={handleSaveMemory}
            onCloseMobile={() => setMobileView('chat')}
          />
        </div>
      </div>

      {/* THANH ĐIỀU HƯỚNG MOBILE BOTTOM BAR (chỉ hiển thị trên mobile/tablet nhỏ) */}
      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={`mobile-nav-item ${mobileView === 'conversations' ? 'active' : ''}`}
          onClick={() => setMobileView('conversations')}
        >
          <span className="nav-icon">👥</span>
          <span className="nav-label">Học viên</span>
          {conversations.some((c) => c.unreadCount > 0) && (
            <span className="nav-unread-dot" />
          )}
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${mobileView === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileView('chat')}
        >
          <span className="nav-icon">💬</span>
          <span className="nav-label">Tin nhắn</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${mobileView === 'assistant' ? 'active' : ''}`}
          onClick={() => setMobileView('assistant')}
        >
          <span className="nav-icon">🤖</span>
          <span className="nav-label">Trợ lý AI</span>
          {selectedConversation?.profile?.dataStatus === 'conflict' && (
            <span className="nav-alert-dot" />
          )}
        </button>
      </nav>
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
