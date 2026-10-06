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
  AssignmentReviewOption,
  StudentIdentity,
  StudentOption,
  StudentSummary
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
  confirmReviewSession,
  deleteStudentCustomField,
  deleteStudentMemory,
  getConversationSourceContext,
  getConversationStudentLink,
  ensureConversationStudentProfile,
  getConversationPage,
  getConversationMessagePage,
  getHealth,
  getPages,
  getStudentContext,
  getStudentSummary,
  linkStudentToConversation,
  saveStudentProfile,
  logoutAppSession,
  updateStudentCustomField,
  updateStudentMemory,
  validateAIConnection,
  syncConversationHistory,
  ApiError
} from './services/api';
import { getStaffUserId, setStaffUserId } from './lib/userId';
import { adaptPronouns, cleanCorruptions } from './lib/pronounAdapter';
import { clearAppSession, getSessionToken, setAppSession } from './lib/session';
import { LoginGate } from './components/LoginGate';

// The fixture runner supplies a signed, fake staff session only to Vite dev.
// Backend requests still pass through the normal session and page checks.
if (import.meta.env.DEV && import.meta.env.VITE_TEST_SESSION_TOKEN?.trim()) {
  setAppSession({ sessionToken: import.meta.env.VITE_TEST_SESSION_TOKEN.trim() });
}

const CONVERSATION_LIMIT = 50;
const MESSAGE_LIMIT = 50;
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
  const [conversationCursors,setConversationCursors]=useState<Record<string,string|null>>({});
  const [hasMoreConversations,setHasMoreConversations]=useState(false);
  const [isLoadingMoreConversations,setIsLoadingMoreConversations]=useState(false);
  const [messageCursor,setMessageCursor]=useState<string|null>(null);
  const [hasMoreMessages,setHasMoreMessages]=useState(false);
  const [isLoadingOlderMessages,setIsLoadingOlderMessages]=useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isLoadingContext, setIsLoadingContext] = useState<boolean>(false);
  const [isSavingContext, setIsSavingContext] = useState<boolean>(false);
  const [studentIdentity, setStudentIdentity] = useState<StudentIdentity | null>(null);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentSummary, setStudentSummary] = useState<StudentSummary | null>(null);
  const [contextReloadKey, setContextReloadKey] = useState(0);
  const [pendingEvidenceMessageId,setPendingEvidenceMessageId]=useState<string|null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastError, setLastError] = useState<string>('');
  const [showBugPanel, setShowBugPanel] = useState(false);
  const [staffUserIdInput, setStaffUserIdInput] = useState<string>(() => getStaffUserId());
  const [hasSession, setHasSession] = useState<boolean>(() => Boolean(getSessionToken()));
  const allowDevUserHeader =
    import.meta.env.VITE_ALLOW_DEV_USER_HEADER === '1' ||
    import.meta.env.VITE_ALLOW_DEV_USER_HEADER === 'true';
  const suggestionRequestRef = useRef(0);
  const conversationRequestRef = useRef(0);
  const draftsByConversationRef = useRef(new Map<string, string>());
  const sourceMessagesRef = useRef(new Map<string, ChatMessage[]>());
  const activeStudentScopeRef = useRef('');
  const evidenceRequestRef = useRef(0);

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
  activeStudentScopeRef.current = `${selectedConversation?.id || ''}:${studentIdentity?.conversationId === selectedConversation?.id ? studentIdentity?.student?.id || '' : ''}`;

  useEffect(()=>{
    if(!pendingEvidenceMessageId||!selectedConversation)return;
    const message=selectedConversation.messages.find((item)=>item.id===pendingEvidenceMessageId);
    if(!message)return;
    const element=document.getElementById(`message-${pendingEvidenceMessageId}`);
    element?.scrollIntoView({behavior:'smooth',block:'center'});
    if(element) {
      element.dataset.evidenceFocus='true';
      window.setTimeout(()=>{delete element.dataset.evidenceFocus},4000);
    }
    setPendingEvidenceMessageId(null);
  },[pendingEvidenceMessageId,selectedConversation?.id,selectedConversation?.messages]);

  useEffect(() => {
    if (errorMessage) setLastError(errorMessage);
  }, [errorMessage]);

  useEffect(() => {
    const receive=(event:Event)=>{
      const message=(event as CustomEvent<unknown>).detail;
      if(typeof message==='string')setLastError(message);
    };
    window.addEventListener('ttd:feature-error',receive);
    return()=>window.removeEventListener('ttd:feature-error',receive);
  },[]);

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
        conversation.studentId === context.studentId
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

      const page = await getConversationPage(selectedPageIds, CONVERSATION_LIMIT);
      const items=page.items;
      if (requestNumber !== conversationRequestRef.current) return;
      setConversationCursors(page.nextCursors||{});setHasMoreConversations(Boolean(page.hasMore));
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
              suggestions:existing?.studentId===item.studentId&&existing?.suggestions?.length?existing.suggestions:item.suggestions,
              flagReason: existing?.flagReason || item.flagReason,
              aiAnalysis: existing?.aiAnalysis || item.aiAnalysis,
              aiProvider: existing?.aiProvider || item.aiProvider,
              studentId:item.studentId,
              studentRevision:item.studentRevision,
              generationFacts:existing?.studentId===item.studentId?existing?.generationFacts:undefined,
              isDemoFallback: existing?.isDemoFallback || item.isDemoFallback,
              profile:existing?.studentId===item.studentId?existing?.profile:item.profile,
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

  const loadMoreConversations=useCallback(async()=>{
    if(isLoadingMoreConversations||!hasMoreConversations)return;
    const scope=conversationRequestRef.current;
    setIsLoadingMoreConversations(true);
    try {
      const page=await getConversationPage(selectedPageIds,CONVERSATION_LIMIT,undefined,conversationCursors);
      if(scope!==conversationRequestRef.current)return;
      setConversationCursors(page.nextCursors||{});setHasMoreConversations(Boolean(page.hasMore));
      setConversations(current=>{
        const known=new Set(current.map(item=>item.id));
        return [...current,...page.items.filter(item=>!known.has(item.id)).map(item=>mapConversationSummary(item,pageNameById))];
      });
    } catch(error){if(scope===conversationRequestRef.current)setErrorMessage(getErrorMessage(error));}
    finally{setIsLoadingMoreConversations(false);}
  },[isLoadingMoreConversations,hasMoreConversations,selectedPageIds,conversationCursors,pageNameById]);

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
    if (!hasSession) return;

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
  }, [hasSession]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (!selectedId || !selectedConversation?.pageId) return;

    let isCurrent = true;
    const controller = new AbortController();
    setIsLoadingMessages(true);
    setMessageCursor(null);setHasMoreMessages(false);setIsLoadingOlderMessages(false);
    setErrorMessage('');

    getConversationMessagePage(selectedId, selectedConversation.pageId, MESSAGE_LIMIT, controller.signal)
      .then((page) => {
        const items=page.items;
        if (!isCurrent) return;
        setMessageCursor(page.nextCursor||null);setHasMoreMessages(Boolean(page.hasMore));
        if(page.paginationError)setErrorMessage(page.paginationError);
        const messages = Array.from(new Map([...(sourceMessagesRef.current.get(selectedId) || []), ...items.map(mapChatMessage)]
          .map((message) => [message.id, message])).values())
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
    if (!selectedConversation) {
      setStudentIdentity(null);
      setStudentOptions([]);
      setStudentSummary(null);
      return;
    }
    const controller = new AbortController();
    setStudentIdentity(null);
    setStudentOptions([]);
    setStudentSummary(null);
    setIsLoadingContext(true);
    getConversationStudentLink(selectedConversation.id, selectedConversation.pageId, controller.signal)
      .then(async result => result.identity.status === 'linked' ? result : ensureConversationStudentProfile(selectedConversation.id,selectedConversation.pageId,controller.signal))
      .then(({ identity, students }) => {
        if (controller.signal.aborted) return;
        setStudentIdentity(identity);
        setStudentOptions(students);
        setConversations((current) => current.map((conversation) => conversation.id === selectedConversation.id
          ? { ...conversation, studentId: identity.student?.id, studentName: identity.student?.name || identity.customerName,
              profile: undefined, memories: undefined, contextRevision: undefined, studentRevision: identity.student?.revision }
          : conversation));
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingContext(false);
      });
    return () => controller.abort();
  }, [selectedConversation?.id, selectedConversation?.pageId,selectedConversation?.studentId]);

  useEffect(() => {
    const current = selectedConversation;
    const linkedStudent = studentIdentity && studentIdentity.conversationId === current?.id ? studentIdentity.student : null;
    if (!current || !linkedStudent) {
      setStudentSummary(null);
      setIsLoadingContext(false);
      return;
    }
    const controller = new AbortController();
    setIsLoadingContext(true);
    Promise.all([
      getStudentContext({ pageId: current.pageId, studentId: linkedStudent.id, studentName: linkedStudent.name, signal: controller.signal }),
      getStudentSummary(linkedStudent.id, controller.signal)
    ])
      .then(([context, summary]) => {
        if (controller.signal.aborted) return;
        applyStudentContext(context);
        setStudentSummary(summary);
        setStudentIdentity((identity) => identity?.student?.id === linkedStudent.id
          ? { ...identity, student: { ...identity.student, revision: summary.revision } }
          : identity);
        setConversations((rows) => rows.map((conversation) => conversation.id === current.id
          ? { ...conversation, studentRevision: summary.revision }
          : conversation));
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingContext(false);
      });
    return () => controller.abort();
  }, [applyStudentContext, contextReloadKey, selectedConversation?.id, selectedConversation?.pageId, studentIdentity?.student?.id]);

  const handleLinkStudent = useCallback(async (input:{studentId?:string;newStudentName?:string;importLegacyContext?:boolean}) => {
    if (!selectedConversation) return;
    const result = await linkStudentToConversation({
      conversationId:selectedConversation.id,pageId:selectedConversation.pageId,...input
    });
    if (!activeStudentScopeRef.current.startsWith(`${selectedConversation.id}:`)) return;
    setStudentIdentity(result.identity);
    setStudentOptions(result.students);
    setConversations((current)=>current.map((conversation)=>conversation.id===selectedConversation.id
      ? {...conversation,studentId:result.identity.student?.id,studentName:result.identity.student?.name||result.identity.customerName,
        profile:undefined,memories:undefined,contextRevision:undefined,studentRevision:result.identity.student?.revision,assignmentOptions:[],suggestions:[],generationFacts:[]}
      :conversation));
  },[selectedConversation]);

  const refreshStudentSummary = useCallback(async () => {
    const studentId=studentIdentity?.student?.id;
    if(!studentId) return null;
    const scope = `${selectedConversation?.id || ''}:${studentId}`;
    const summary=await getStudentSummary(studentId);
    if (activeStudentScopeRef.current !== scope) return summary;
    setStudentSummary(summary);
    setStudentIdentity((identity)=>identity?.student?.id===studentId
      ? {...identity,student:{...identity.student,revision:summary.revision}}:identity);
    setConversations((current)=>current.map((conversation)=>conversation.id===selectedConversation?.id
      ? {...conversation,studentRevision:summary.revision}:conversation));
    return summary;
  },[selectedConversation?.id,studentIdentity?.student?.id]);

  const handleConfirmReviewSession = useCallback(async (reviewSessionId:string) => {
    const studentId=studentIdentity?.student?.id;
    if(!studentId) return;
    await confirmReviewSession({studentId,reviewSessionId,confirmed:true,evidence:'Nhân viên xác nhận đã gửi nhận xét.'});
    await refreshStudentSummary();
  },[refreshStudentSummary,studentIdentity?.student?.id]);

  const loadOlderMessages=useCallback(async()=>{
    if(!selectedConversation||!messageCursor||isLoadingOlderMessages)return;
    const id=selectedConversation.id;
    const scope=activeStudentScopeRef.current;
    setIsLoadingOlderMessages(true);
    try {
      const page=await getConversationMessagePage(id,selectedConversation.pageId,MESSAGE_LIMIT,undefined,messageCursor);
      if(scope!==activeStudentScopeRef.current)return;
      if(page.hasMore&&page.nextCursor===messageCursor)throw new Error('Pancake trả lại cùng mốc lịch sử. Hãy thử tải lại.');
      setMessageCursor(page.nextCursor||null);setHasMoreMessages(Boolean(page.hasMore));
      setConversations(current=>current.map(conversation=>conversation.id===id?{...conversation,messages:
        Array.from(new Map([...page.items.map(mapChatMessage),...conversation.messages].map(message=>[message.id,message])).values())
          .sort((a,b)=>Date.parse(a.createdAt||a.sentAt)-Date.parse(b.createdAt||b.sentAt))}:conversation));
      await refreshStudentSummary();
    } catch(error){if(scope===activeStudentScopeRef.current)setErrorMessage(getErrorMessage(error));throw error;}
    finally{if(scope===activeStudentScopeRef.current)setIsLoadingOlderMessages(false);}
  },[selectedConversation,messageCursor,isLoadingOlderMessages,refreshStudentSummary]);

  const handleSyncConversationHistory = useCallback(async () => {
    if(!selectedConversation) return;
    const result=await syncConversationHistory({conversationId:selectedConversation.id,pageId:selectedConversation.pageId,pages:3});
    await refreshStudentSummary();
    const page=await getConversationMessagePage(selectedConversation.id,selectedConversation.pageId,MESSAGE_LIMIT);
    if(!activeStudentScopeRef.current.startsWith(`${selectedConversation.id}:`))return result;
    setConversations(current=>current.map(conversation=>conversation.id===selectedConversation.id?{...conversation,messages:
      Array.from(new Map([...conversation.messages,...page.items.map(mapChatMessage)].map(message=>[message.id,message])).values())
        .sort((a,b)=>Date.parse(a.createdAt||a.sentAt)-Date.parse(b.createdAt||b.sentAt))}:conversation));
    return result;
  },[refreshStudentSummary,selectedConversation]);

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
    evidenceRequestRef.current += 1;
    setPendingEvidenceMessageId(null);
    setConflictDialog({isOpen:false,pendingContent:''});
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

  const handleOpenEvidence=useCallback(async (conversationId:string,messageId?:string)=>{
    const pageId=selectedConversation?.pageId;
    if (!pageId) return;
    if (!messageId) {
      if(conversations.some((item)=>item.id===conversationId)) handleSelectConversation(conversationId);
      else setErrorMessage('Nguồn này chưa có ID tin nhắn để mở. Xem bản nguyên văn trong hồ sơ.');
      return;
    }
    const request=++evidenceRequestRef.current;
    try {
      const result=await getConversationSourceContext(conversationId,pageId,messageId);
      if (request!==evidenceRequestRef.current) return;
      const sourceMessages=result.items.map(mapChatMessage);
      sourceMessagesRef.current.set(conversationId,sourceMessages);
      setConversations((rows)=>rows.some((item)=>item.id===conversationId)
        ? rows.map((item)=>item.id===conversationId?{...item,messages:sourceMessages}:item)
        : [...rows,{...mapConversationSummary(result.conversation,new Map()),messages:sourceMessages}]);
      handleSelectConversation(conversationId);
      setPendingEvidenceMessageId(messageId);
    } catch(error) {if(request===evidenceRequestRef.current)setErrorMessage(getErrorMessage(error));}
  },[conversations,handleSelectConversation,selectedConversation?.pageId]);

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
    async (reviewText: string, assignmentId?:string, assignmentTitle?:string, reviewSessionKey?:string, sourceMessageId?:string) => {
      if (!selectedConversation) return;
      const trimmed = reviewText.trim();
      if (!trimmed) return;

      try {
        const scope=activeStudentScopeRef.current;
        const response = await createTeacherReview({
          conversationId: selectedConversation.id,
          teacherInput: trimmed,
          pronouns: currentPronouns,
          messages: selectedConversation.messages || [],
          studentId: studentIdentity?.student?.id,
          contextRevision: studentSummary?.revision,
          assignmentId,
          assignmentTitle,
          reviewSessionKey,
          sourceMessageId
        });
        if(scope!==activeStudentScopeRef.current) return;

        const options: AssignmentReviewOption[] = response.suggestions.map((sug, index) => ({
          id: sug.id || `asg_${Date.now()}_${index}`,
          tone: sug.tone,
          content: sug.content,
          usedFacts: sug.usedFacts || [trimmed],
          reviewSessionId: response.reviewSessionId || undefined
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
        await refreshStudentSummary();
        return response.reviewSessionId || undefined;
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
        throw error;
      }
    },
    [selectedConversation, currentPronouns, refreshStudentSummary, studentIdentity?.student?.id, studentSummary?.revision]
  );

  const handleAddCustomField = useCallback(async (field: Omit<CustomField, 'id' | 'source'>) => {
    if (!selectedConversation || !studentIdentity?.student) return;
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
  }, [applyStudentContext, handleContextMutationError, selectedConversation, studentIdentity?.student?.id]);

  // Accept AI Suggested Field in Profile
  const handleAcceptAiProfileSuggestion = useCallback(async (fieldKey: string, newValue: string) => {
    if (!selectedConversation?.profile || !studentIdentity?.student) return;
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
  }, [applyStudentContext, handleContextMutationError, selectedConversation, studentIdentity?.student?.id]);

  // Save new memory item or apply suggested memory
  const handleSaveMemory = useCallback(async (content: string, reason?: string) => {
    if (!selectedConversation || !studentIdentity?.student) return;
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
  }, [applyStudentContext, handleContextMutationError, selectedConversation, studentIdentity?.student?.id]);

  const handleMemoryAction = useCallback(async (
    memoryId: string,
    action: 'activate' | 'archive' | 'restore'
  ) => {
    if (!selectedConversation || !studentIdentity?.student) return;
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
  }, [applyStudentContext, handleContextMutationError, selectedConversation, studentIdentity?.student?.id]);

  const handleDeleteMemory = useCallback(async (memoryId: string) => {
    if (!selectedConversation || !studentIdentity?.student) return;
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
  }, [applyStudentContext, handleContextMutationError, selectedConversation, studentIdentity?.student?.id]);

  const handleUpdateCustomField = useCallback(async (
    fieldId: string,
    changes: { value?: string; addOption?: string; useInSuggestions?: boolean; hidden?: boolean }
  ) => {
    if (!selectedConversation || !studentIdentity?.student) return;
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
      throw error;
    } finally {
      setIsSavingContext(false);
    }
  }, [applyStudentContext, handleContextMutationError, selectedConversation, studentIdentity?.student?.id]);

  const handleDeleteCustomField = useCallback(async (fieldId: string) => {
    if (!selectedConversation || !studentIdentity?.student) return;
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
  }, [applyStudentContext, handleContextMutationError, selectedConversation, studentIdentity?.student?.id]);

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
        studentId: studentIdentity?.student?.id,
        contextRevision: studentSummary?.revision,
        pronouns: currentPronouns,
        messages: selectedConversation.messages,
      });

      if (requestNumber !== suggestionRequestRef.current) return;
      setLastError('');

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
                generationFacts:result.usedFacts,
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
  }, [currentPronouns, isGenerating, selectedConversation, studentIdentity?.student?.id, studentSummary?.revision]);


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
          <div className={pages.length <= 1 ? 'single-page-selector' : undefined}><PageSelector
            pages={pages}
            selectedPageIds={selectedPageIds}
            isLoading={isLoadingPages}
            onChange={handlePageSelectionChange}
          /></div>
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
              {aiMode === 'user_override' ? `AI riêng: ${aiProvider} / ${aiModel || 'chưa đủ cấu hình'}` : `AI mặc định: ${health?.aiProvider || 'đang tải'}${health?.aiModel ? ` / ${health.aiModel}` : ''}`}
            </span>
          </button>

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
            hasMore={hasMoreConversations}
            isLoadingMore={isLoadingMoreConversations}
            onLoadMore={loadMoreConversations}
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
            hasMoreMessages={hasMoreMessages}
            isLoadingOlderMessages={isLoadingOlderMessages}
            onLoadOlderMessages={loadOlderMessages}
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
            isContextLoading={isLoadingContext}
            isSavingContext={isSavingContext}
            studentIdentity={studentIdentity?.conversationId===selectedConversation?.id?studentIdentity:null}
            studentOptions={studentOptions}
            studentSummary={studentSummary?.studentId===studentIdentity?.student?.id?studentSummary:null}
            onLinkStudent={handleLinkStudent}
            onRefreshStudentSummary={refreshStudentSummary}
            onConfirmReviewSession={handleConfirmReviewSession}
            onSyncConversationHistory={handleSyncConversationHistory}
            onOpenEvidence={handleOpenEvidence}
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
                  <span><strong>Mặc định hệ thống: {health?.aiProvider || 'đang tải'}{health?.aiModel ? ` / ${health.aiModel}` : ''}</strong><small>Dùng provider và model trên server; không gửi key từ trình duyệt.</small></span>
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
                <>
                {health?.aiConfigured === false && <div className="settings-error-summary" role="alert">Backend chưa có cấu hình AI hợp lệ. Hãy điền AI_PROVIDER, AI_PROVIDER_API_KEY và AI_PROVIDER_MODEL vào backend/.env rồi khởi động lại backend. Pancake token chỉ dùng để đọc tin nhắn.</div>}
                <button type="button" className="btn-danger-text btn-clear-ai-override" onClick={handleUseSystemAi}>
                  Xóa toàn bộ cấu hình riêng đã lưu
                </button>
                </>
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
      <div className="bug-dock">
        {showBugPanel && (
          <section className="bug-panel" aria-label="Chi tiết lỗi">
            <div className="bug-panel-header">
              <strong>Thông tin lỗi</strong>
              <button type="button" onClick={() => setShowBugPanel(false)} aria-label="Đóng thông tin lỗi">×</button>
            </div>
            {lastError ? <p role="alert">{lastError}</p> : <p>Chưa ghi nhận lỗi trong phiên này.</p>}
            <dl>
              <div><dt>Backend</dt><dd>{health?.ok ? 'Đang kết nối' : 'Chưa kết nối'}</dd></div>
              <div><dt>AI</dt><dd>{health?.aiProvider || 'Chưa rõ'}{health?.aiModel ? ` / ${health.aiModel}` : ''}</dd></div>
              <div><dt>Hội thoại</dt><dd>{selectedConversation ? `${selectedConversation.messages.length} tin đã tải` : 'Chưa chọn'}</dd></div>
            </dl>
            {lastError && <button type="button" className="bug-panel-clear" onClick={() => { setLastError(''); setErrorMessage(''); }}>Xóa lỗi</button>}
          </section>
        )}
        <button type="button" className={`bug-button ${lastError ? 'has-error' : ''}`} onClick={() => setShowBugPanel((open) => !open)} aria-label={lastError ? 'Xem lỗi gần nhất' : 'Xem trạng thái và lỗi'} aria-expanded={showBugPanel} title="Xem lỗi">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 6.5 6.5 4M16 6.5 17.5 4M7 10H4m16 0h-3M7 15H4m16 0h-3M8 19l-1.5 2M16 19l1.5 2"/><rect x="7" y="6" width="10" height="14" rx="5"/><path d="M7 11h10"/></svg>
          {lastError && <span className="bug-button-dot" />}
        </button>
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
    studentName: item.studentIdentity?.student?.name || item.customerName || 'Khách hàng Pancake',
    studentId:item.studentIdentity?.student?.id,studentRevision:item.studentIdentity?.student?.revision,
    customerName:item.customerName,
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
    senderName: message.senderName,
    text: message.text || getAttachmentText(message.attachments),
    sourceText: message.text,
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
