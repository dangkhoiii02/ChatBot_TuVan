import { AiProviderFields } from '../../shared/AiProviderFields';
import {
  clearAIOverride,
  clearSessionAIKey,
  migrateAISettings,
  readAISettings,
  saveAISettings,
  validateAISettings,
  type AISettingsMode
} from '../../shared/ai-settings';
migrateAISettings();
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
  AssignmentReviewOption
} from './types';
import { ConversationSidebar } from './components/ConversationSidebar';
import { ChatThread } from './components/ChatThread';
import { SuggestionPanel } from './components/SuggestionPanel';
import { PageSelector } from './components/PageSelector';
import {
  createSuggestions,
  createTeacherReview,
  createStudentCustomField,
  createStudentMemory,
  deleteStudentCustomField,
  deleteStudentMemory,
  getConversationMessages,
  getConversations,
  getHealth,
  getPages,
  getStudentContext,
  saveStudentProfile,
  logoutAppSession,
  updateStudentCustomField,
  updateStudentMemory,
  validateAIConnection,
  ApiError
} from './services/api';
import { getStaffUserId, setStaffUserId } from './lib/userId';
import { adaptPronouns, cleanCorruptions } from './lib/pronounAdapter';
import { clearAppSession, getSessionToken } from './lib/session';
import { LoginGate } from './components/LoginGate';

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
  const [isLoadingPages, setIsLoadingPages] = useState<boolean>(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isLoadingContext, setIsLoadingContext] = useState<boolean>(false);
  const [isSavingContext, setIsSavingContext] = useState<boolean>(false);
  const [contextReloadKey, setContextReloadKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [staffUserIdInput, setStaffUserIdInput] = useState<string>(() => getStaffUserId());
  const [hasSession, setHasSession] = useState<boolean>(() => Boolean(getSessionToken()));
  const allowDevUserHeader =
    import.meta.env.VITE_ALLOW_DEV_USER_HEADER === '1' ||
    import.meta.env.VITE_ALLOW_DEV_USER_HEADER === 'true';
  const hasLoadedPagesRef = useRef(false);
  const suggestionRequestRef = useRef(0);
  const conversationRequestRef = useRef(0);
  const draftsByConversationRef = useRef(new Map<string, string>());

  // AI API Key & Model configuration
  const [showAiSettings, setShowAiSettings] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<AISettingsMode>(() => readAISettings().mode);
  const [aiApiKey, setAiApiKey] = useState<string>(() => readAISettings().apiKey || '');
  const [aiProvider, setAiProvider] = useState(() => readAISettings().provider);
  const [aiBaseUrl, setAiBaseUrl] = useState(() => readAISettings().baseUrl || '');
  const [aiModel, setAiModel] = useState<string>(() => readAISettings().model || '');
  const [rememberAiKey, setRememberAiKey] = useState<boolean>(() => readAISettings().rememberKey);
  const [showKeySecret, setShowKeySecret] = useState<boolean>(false);
  const [aiSettingsErrors, setAiSettingsErrors] = useState<string[]>([]);
  const [aiConnectionStatus, setAiConnectionStatus] = useState<string>('');
  const [isTestingAi, setIsTestingAi] = useState(false);

  const handleCloseAiSettings = useCallback(() => {
    const saved = readAISettings();
    setAiMode(saved.mode);
    setAiApiKey(saved.apiKey || '');
    setAiModel(saved.model || '');
    setAiProvider(saved.provider);
    setAiBaseUrl(saved.baseUrl || '');
    setRememberAiKey(saved.rememberKey);
    setAiSettingsErrors([]);
    setAiConnectionStatus('');
    setShowAiSettings(false);
  }, []);

  const handleSaveAiSettings = useCallback(() => {
    const next = {
      mode: aiMode,
      provider: aiProvider,
      apiKey: aiApiKey.trim() || undefined,
      model: aiModel.trim() || undefined,
      baseUrl: aiBaseUrl.trim() || undefined,
      rememberKey: rememberAiKey
    };
    const errors = validateAISettings(next);
    if (errors.length) {
      setAiSettingsErrors(errors);
      return;
    }
    saveAISettings(next);
    setAiSettingsErrors([]);
    setShowAiSettings(false);
  }, [aiApiKey, aiBaseUrl, aiMode, aiModel, aiProvider, rememberAiKey]);

  const handleClearApiKey = useCallback(() => {
    setAiApiKey('');
  }, []);

  const handleUseSystemAi = useCallback(() => {
    clearAIOverride();
    setAiMode('system');
    setAiApiKey('');
    setAiModel('');
    setAiProvider('auto');
    setAiBaseUrl('');
    setRememberAiKey(false);
    setAiSettingsErrors([]);
    setAiConnectionStatus('Đã chuyển về cấu hình AI của hệ thống.');
  }, []);

  const handleTestAiConnection = useCallback(async () => {
    const settings = {
      mode: aiMode,
      provider: aiProvider,
      apiKey: aiApiKey.trim() || undefined,
      model: aiModel.trim() || undefined,
      baseUrl: aiBaseUrl.trim() || undefined,
      rememberKey: rememberAiKey
    };
    const errors = validateAISettings(settings);
    if (errors.length) {
      setAiSettingsErrors(errors);
      return;
    }
    setIsTestingAi(true);
    setAiConnectionStatus('');
    setAiSettingsErrors([]);
    try {
      const result = await validateAIConnection(settings);
      setAiConnectionStatus(`Kết nối thành công: ${result.provider} / ${result.model}`);
    } catch (error) {
      setAiSettingsErrors([getErrorMessage(error)]);
    } finally {
      setIsTestingAi(false);
    }
  }, [aiApiKey, aiBaseUrl, aiMode, aiModel, aiProvider, rememberAiKey]);

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

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSessionAIKey();
      setHasSession(false);
      setErrorMessage('Phiên đăng nhập đã hết hạn. Bản nháp hiện tại vẫn được giữ; vui lòng đăng nhập lại.');
    };
    window.addEventListener('ttd:session-expired', handleSessionExpired);
    return () => window.removeEventListener('ttd:session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    if (selectedId) draftsByConversationRef.current.set(selectedId, draftMessage);
  }, [draftMessage, selectedId]);

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
  }, [
    selectedConversation?.id,
    selectedConversation?.profile?.recipientCall,
    selectedConversation?.profile?.senderCall,
    selectedConversation?.studentName
  ]);

  const applyStudentContext = useCallback((context: Awaited<ReturnType<typeof getStudentContext>>) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.pageId === context.pageId &&
        (conversation.studentId === context.studentId ||
          (!conversation.studentId && conversation.id === context.studentId))
          ? {
              ...conversation,
              studentId: context.studentId,
              profile: context.profile,
              memories: context.memories,
              contextRevision: context.revision,
              contextUpdatedAt: context.updatedAt
            }
          : conversation
      )
    );
  }, []);

  const pageNameById = useMemo(
    () => new Map(pages.map((page) => [page.id, page.name])),
    [pages]
  );

  const refreshConversations = useCallback(async () => {
    if (!selectedPageIds.length) return;
    const requestNumber = ++conversationRequestRef.current;

    setIsLoadingConversations(true);
    setErrorMessage('');

    try {
      if (!selectedPageIds.length) {
        setConversations([]);
        setSelectedId('');
        return;
      }

      const items = await getConversations(selectedPageIds, CONVERSATION_LIMIT);
      if (requestNumber !== conversationRequestRef.current) return;
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
      if (requestNumber !== conversationRequestRef.current || isAbortError(error)) return;
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoadingConversations(false);
    }
  }, [pageNameById, selectedPageIds]);

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then(setHealth)
      .catch((error) => {
        if (isAbortError(error)) return;
        setErrorMessage(getErrorMessage(error));
        setHealth(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (hasLoadedPagesRef.current) return;
    hasLoadedPagesRef.current = true;

    let isCurrent = true;
    const controller = new AbortController();

    setIsLoadingPages(true);
    setErrorMessage('');

    getPages(controller.signal)
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
        if (isCurrent && !isAbortError(error)) {
          setErrorMessage(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingPages(false);
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (!selectedId || !selectedConversation?.pageId) return;

    let isCurrent = true;
    const controller = new AbortController();
    setIsLoadingMessages(true);
    setErrorMessage('');

    getConversationMessages(selectedId, selectedConversation.pageId, MESSAGE_LIMIT, controller.signal)
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
        if (isCurrent && !isAbortError(error)) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingMessages(false);
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [selectedConversation?.pageId, selectedId]);

  useEffect(() => {
    if (!selectedConversation) return;
    const controller = new AbortController();
    const studentId = selectedConversation.studentId || selectedConversation.id;
    setIsLoadingContext(true);
    getStudentContext({
      pageId: selectedConversation.pageId,
      studentId,
      studentName: selectedConversation.studentName,
      signal: controller.signal
    })
      .then(applyStudentContext)
      .catch((error) => {
        if (!isAbortError(error)) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingContext(false);
      });
    return () => controller.abort();
  }, [
    applyStudentContext,
    contextReloadKey,
    selectedConversation?.id,
    selectedConversation?.pageId
  ]);

  const handleContextMutationError = useCallback((error: unknown) => {
    setErrorMessage(getErrorMessage(error));
    if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
      setContextReloadKey((value) => value + 1);
    }
  }, []);

  const handlePageSelectionChange = useCallback((pageIds: string[]) => {
    draftsByConversationRef.current.clear();
    setSelectedPageIds(pageIds);
    setSelectedId('');
    setConversations([]);
    setDraftMessage('');
    setCopySuccess(false);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    suggestionRequestRef.current += 1;
    setIsGenerating(false);
    setSelectedId(id);
    setCopySuccess(false);
    setDraftMessage(draftsByConversationRef.current.get(id) || '');
    setMobileView('chat');

    setConversations((prev) =>
      prev.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

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
    const cleanedContent = cleanCorruptions(content);
    const trimmedDraft = draftMessage.trim();
    if (!trimmedDraft) {
      setDraftMessage(cleanedContent);
      setCopySuccess(false);
      setMobileView('chat');
      return;
    }

    if (trimmedDraft === cleanedContent.trim()) {
      setMobileView('chat');
      return;
    }

    // Conflict: user already typed text in draft
    setConflictDialog({
      isOpen: true,
      pendingContent: cleanedContent
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

  // Quick Pronoun Changing with Safe Unicode-aware Suggestion Adaptation
  const handleChangePronouns = useCallback((newPair: PronounPair) => {
    const oldPair = currentPronouns;
    setCurrentPronouns(newPair);

    if (!selectedConversation) return;

    const updatedProfile = selectedConversation.profile
      ? {
          ...selectedConversation.profile,
          recipientCall: newPair.recipientCall,
          senderCall: newPair.senderCall,
          fields: selectedConversation.profile.fields.map((field) => {
            if (field.key === 'sender') return { ...field, value: newPair.senderCall, source: 'user_input' as const };
            if (field.key === 'recipient') {
              return {
                ...field,
                value: `${newPair.recipientCall} ${selectedConversation.studentName.replace(/^(Em|Chị|Anh|Bạn)\s*/i, '')}`,
                source: 'user_input' as const
              };
            }
            return field;
          })
        }
      : undefined;

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === selectedConversation.id) {
          const updatedSuggestions = (c.suggestions || []).map((s) => ({
            ...s,
            content: adaptPronouns(s.content, oldPair, newPair)
          }));
          const updatedAssignmentOptions = (c.assignmentOptions || []).map((o) => ({
            ...o,
            content: adaptPronouns(o.content, oldPair, newPair)
          }));
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

    // Also adapt draft message if user has draft in progress
    setDraftMessage((prevDraft) => {
      if (!prevDraft.trim()) return prevDraft;
      return adaptPronouns(prevDraft, oldPair, newPair);
    });

    if (updatedProfile) {
      setIsSavingContext(true);
      void saveStudentProfile({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        profile: updatedProfile
      })
        .then(applyStudentContext)
        .catch(handleContextMutationError)
        .finally(() => setIsSavingContext(false));
    }
  }, [
    applyStudentContext,
    currentPronouns,
    handleContextMutationError,
    selectedConversation
  ]);

  // Fast Pedagogical Assignment Review Generator connected to Backend API
  const handleGradeAssignment = useCallback(
    async (reviewText: string) => {
      if (!selectedConversation) return;
      const trimmed = reviewText.trim();
      if (!trimmed) return;

      try {
        const response = await createTeacherReview({
          conversationId: selectedConversation.id,
          teacherInput: trimmed,
          pronouns: currentPronouns,
          messages: selectedConversation.messages || []
        });

        const options: AssignmentReviewOption[] = response.suggestions.map((sug, index) => ({
          id: sug.id || `asg_${Date.now()}_${index}`,
          tone: sug.tone,
          content: sug.content,
          usedFacts: sug.usedFacts || [trimmed]
        }));

        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedConversation.id
              ? {
                  ...c,
                  assignmentOptions: options
                }
              : c
          )
        );
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
        throw error;
      }
    },
    [selectedConversation, currentPronouns]
  );

  const handleAddCustomField = useCallback(async (field: Omit<CustomField, 'id' | 'source'>) => {
    if (!selectedConversation) return;
    setIsSavingContext(true);
    setErrorMessage('');
    try {
      const context = await createStudentCustomField({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        field
      });
      applyStudentContext(context);
    } catch (error) {
      handleContextMutationError(error);
      throw error;
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation]);

  // Accept AI Suggested Field in Profile
  const handleAcceptAiProfileSuggestion = useCallback(async (fieldKey: string, newValue: string) => {
    if (!selectedConversation?.profile) return;
    const fields = selectedConversation.profile.fields.map((field) =>
      field.key === fieldKey
        ? {
            ...field,
            value: newValue,
            source: 'confirmed' as const,
            aiSuggestion: undefined,
            conflictReason: undefined
          }
        : field
    );
    const profile = {
      ...selectedConversation.profile,
      fields,
      dataStatus: fields.some((field) => field.source === 'conflict')
        ? ('conflict' as const)
        : ('saved' as const)
    };
    setIsSavingContext(true);
    try {
      const context = await saveStudentProfile({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        profile
      });
      applyStudentContext(context);
    } catch (error) {
      handleContextMutationError(error);
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation]);

  // Save new memory item or apply suggested memory
  const handleSaveMemory = useCallback(async (content: string, reason?: string) => {
    if (!selectedConversation) return;
    setIsSavingContext(true);
    try {
      const context = await createStudentMemory({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        content,
        reason
      });
      applyStudentContext(context);
    } catch (error) {
      handleContextMutationError(error);
      throw error;
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation]);

  const handleMemoryAction = useCallback(async (
    memoryId: string,
    action: 'activate' | 'archive' | 'restore'
  ) => {
    if (!selectedConversation) return;
    setIsSavingContext(true);
    try {
      const context = await updateStudentMemory({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        memoryId,
        action
      });
      applyStudentContext(context);
    } catch (error) {
      handleContextMutationError(error);
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation]);

  const handleDeleteMemory = useCallback(async (memoryId: string) => {
    if (!selectedConversation) return;
    if (!window.confirm('Xóa hẳn ghi nhớ này? Thao tác này không thể hoàn tác.')) return;
    setIsSavingContext(true);
    try {
      const context = await deleteStudentMemory({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        memoryId
      });
      applyStudentContext(context);
    } catch (error) {
      handleContextMutationError(error);
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation]);

  const handleUpdateCustomField = useCallback(async (
    fieldId: string,
    changes: { value?: string; useInSuggestions?: boolean; hidden?: boolean }
  ) => {
    if (!selectedConversation) return;
    setIsSavingContext(true);
    try {
      const context = await updateStudentCustomField({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        fieldId,
        ...changes
      });
      applyStudentContext(context);
    } catch (error) {
      handleContextMutationError(error);
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation]);

  const handleDeleteCustomField = useCallback(async (fieldId: string) => {
    if (!selectedConversation) return;
    if (!window.confirm('Xóa định nghĩa field và giá trị của học viên này?')) return;
    setIsSavingContext(true);
    try {
      const context = await deleteStudentCustomField({
        pageId: selectedConversation.pageId,
        studentId: selectedConversation.studentId || selectedConversation.id,
        studentName: selectedConversation.studentName,
        revision: selectedConversation.contextRevision || 0,
        fieldId
      });
      applyStudentContext(context);
    } catch (error) {
      handleContextMutationError(error);
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation]);

  const handleGenerateSuggestions = useCallback(async () => {
    if (!selectedConversation || isGenerating) return;
    const requestNumber = ++suggestionRequestRef.current;
    const targetConversationId = selectedConversation.id;

    setIsGenerating(true);
    setErrorMessage('');

    try {
      // Gọi Backend API (tích hợp AI Key & Model nếu người dùng đã nhập)
      const result = await createSuggestions({
        conversationId: selectedConversation.id,
        studentId: selectedConversation.studentId || selectedConversation.id,
        contextRevision: selectedConversation.contextRevision || 0,
        pronouns: currentPronouns,
        messages: selectedConversation.messages,
      });

      if (requestNumber !== suggestionRequestRef.current) return;

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === targetConversationId
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
      if (requestNumber === suggestionRequestRef.current) setErrorMessage(getErrorMessage(error));
    } finally {
      if (requestNumber === suggestionRequestRef.current) setIsGenerating(false);
    }
  }, [currentPronouns, isGenerating, selectedConversation]);


  const applyStaffUserId = useCallback(() => {
    setStaffUserId(staffUserIdInput);
    setErrorMessage('');
  }, [staffUserIdInput]);

  const handleLogout = useCallback(() => {
    logoutAppSession();
    clearAppSession();
    clearSessionAIKey();
    setHasSession(false);
    setErrorMessage('');
  }, []);


  if (!hasSession) {
    return (
      <LoginGate
        notice={errorMessage}
        onLoggedIn={() => {
          const settings = readAISettings();
          setAiMode(settings.mode);
          setAiApiKey(settings.apiKey || '');
          setAiModel(settings.model || '');
          setAiProvider(settings.provider);
          setAiBaseUrl(settings.baseUrl || '');
          setRememberAiKey(settings.rememberKey);
          setErrorMessage('');
          setHasSession(true);
        }}
      />
    );
  }

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
          <span className={`badge-status-pill ${health?.ok ? 'badge-active' : 'badge-error'}`}>
            <span className={health?.ok ? 'dot-green' : 'dot-amber'} />
            {health?.ok ? 'Backend sẵn sàng' : 'Backend chưa kết nối'}
          </span>

          {/* Nút Cấu hình AI Key & Model */}
          <button
            type="button"
            className={`btn-mode-toggle btn-gemini-pill ${aiMode === 'user_override' ? 'has-key' : ''}`}
            onClick={() => setShowAiSettings(true)}
            title="Cấu hình AI API Key và chọn Model"
          >
            <span className={`dot-status ${aiMode === 'user_override' ? 'dot-green' : 'dot-amber'}`} />
            <span className="gemini-pill-label">
              {aiMode === 'user_override' ? `AI riêng: ${aiModel || 'chưa đủ cấu hình'}` : 'AI hệ thống'}
            </span>
          </button>
          <span className="badge-status-pill">{conversations.length} hội thoại</span>
          {health && <span className="badge-status-pill">AI: {health.aiProvider}</span>}

          {allowDevUserHeader && (
            <label className="badge-status-pill staff-user-id" title="Dev only: X-User-Id khi ALLOW_DEV_USER_HEADER">
              <span>User ID</span>
              <input
                type="text"
                value={staffUserIdInput}
                placeholder="UUID nhân viên"
                aria-label="X-User-Id"
                onChange={(e) => setStaffUserIdInput(e.target.value)}
                onBlur={applyStaffUserId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyStaffUserId();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </label>
          )}
          <button type="button" className="btn-logout" onClick={handleLogout}>
            Đăng xuất
          </button>

          {errorMessage && (
            <span className="badge-status-pill badge-error" role="alert">
              Lỗi: {errorMessage}
              <button type="button" className="error-dismiss" onClick={() => setErrorMessage('')} aria-label="Đóng thông báo lỗi">
                Đóng
              </button>
            </span>
          )}
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
            onCopyDraft={handleCopyDraft}
            copySuccess={copySuccess}
            isLoadingMessages={isLoadingMessages}
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
            onUpdateCustomField={handleUpdateCustomField}
            onDeleteCustomField={handleDeleteCustomField}
            onAcceptAiProfileSuggestion={handleAcceptAiProfileSuggestion}
            onSaveMemory={handleSaveMemory}
            onDeleteMemory={handleDeleteMemory}
            onMemoryAction={handleMemoryAction}
            onCloseMobile={() => setMobileView('chat')}
            aiApiKey={aiApiKey}
            aiModel={aiModel}
            aiMode={aiMode}
            isContextLoading={isLoadingContext}
            isSavingContext={isSavingContext}
            onOpenAiSettings={() => setShowAiSettings(true)}
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

      {/* MODAL CẤU HÌNH GEMINI API KEY & MÔ HÌNH */}
      {showAiSettings && (
        <div className="modal-backdrop" onClick={handleCloseAiSettings}>
          <div
            className="ai-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title-group">
                <h3 id="ai-settings-title">Cấu hình AI và mô hình</h3>
                <p className="modal-subtitle">
                  Dùng cấu hình hệ thống hoặc cấu hình riêng cho các request của bạn.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseAiSettings}
                title="Đóng"
              >
                Đóng
              </button>
            </div>

            <div className="modal-body">
              <fieldset className="ai-mode-fieldset">
                <legend>Nguồn cấu hình</legend>
                <label className="ai-mode-option">
                  <input type="radio" name="ai-mode" checked={aiMode === 'system'} onChange={() => setAiMode('system')} />
                  <span><strong>Cấu hình hệ thống</strong><small>Không gửi key/model override từ trình duyệt.</small></span>
                </label>
                <label className="ai-mode-option">
                  <input type="radio" name="ai-mode" checked={aiMode === 'user_override'} onChange={() => setAiMode('user_override')} />
                  <span><strong>Cấu hình riêng</strong><small>Dùng provider, key và model dưới đây cho request của bạn.</small></span>
                </label>
              </fieldset>

              {aiMode === 'user_override' && (
                <>
                  <AiProviderFields provider={aiProvider} baseUrl={aiBaseUrl} onProvider={setAiProvider} onBaseUrl={setAiBaseUrl} />
                  <label className="settings-field">
                    <span className="field-label">AI API Key</span>
                    <div className="input-password-row">
                      <input
                        type={showKeySecret ? 'text' : 'password'}
                        className="minimal-input font-mono"
                        placeholder="Dán API key của nhà cung cấp"
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        autoComplete="off"
                      />
                      <button type="button" className="btn-mini" onClick={() => setShowKeySecret((prev) => !prev)}>
                        {showKeySecret ? 'Ẩn' : 'Hiện'}
                      </button>
                      {aiApiKey && (
                        <button type="button" className="btn-mini btn-danger-text" onClick={handleClearApiKey}>
                          Xóa
                        </button>
                      )}
                    </div>
                  </label>

                  <label className="settings-field">
                    <span className="field-label">Mã model</span>
                    <input className="minimal-input ai-key-input" value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="Nhập mã model chính xác" />
                  </label>

                  <label className="checkbox-label ai-remember-key">
                    <input type="checkbox" checked={rememberAiKey} onChange={(e) => setRememberAiKey(e.target.checked)} />
                    <span>Ghi nhớ API key trên thiết bị này</span>
                  </label>
                  <p className="field-hint">Mặc định key chỉ tồn tại trong phiên trình duyệt hiện tại.</p>
                </>
              )}

              {aiSettingsErrors.length > 0 && (
                <div className="settings-error-summary" role="alert" tabIndex={-1}>
                  <strong>Chưa thể áp dụng cấu hình:</strong>
                  <ul>{aiSettingsErrors.map((message) => <li key={message}>{message}</li>)}</ul>
                </div>
              )}
              {aiConnectionStatus && <div className="settings-success" role="status">{aiConnectionStatus}</div>}
              {aiMode === 'system' && (
                <button type="button" className="btn-danger-text btn-clear-ai-override" onClick={handleUseSystemAi}>
                  Xóa toàn bộ cấu hình riêng đã lưu
                </button>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={handleTestAiConnection} disabled={isTestingAi}>
                {isTestingAi ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCloseAiSettings}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveAiSettings}
              >
                Lưu cấu hình
              </button>
            </div>
          </div>
        </div>
      )}
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
    studentId: item.customerId || item.id,
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
  if (error instanceof ApiError) {
    const reference = error.requestId ? ` (mã: ${error.requestId})` : '';
    return `${error.message}${reference}`;
  }
  return error instanceof Error ? error.message : 'Có lỗi xảy ra';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
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
