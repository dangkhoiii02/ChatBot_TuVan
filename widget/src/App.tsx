import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { StudentCard } from './components/StudentCard';
import { ContextStrip } from './components/ContextStrip';
import { TabBar } from './components/TabBar';
import { FooterCta } from './components/FooterCta';
import { LoginPanel } from './components/LoginPanel';
import { SuggestionsTab } from './components/tabs/SuggestionsTab';
import { StudentTab } from './components/tabs/StudentTab';
import { GradingTab } from './components/tabs/GradingTab';
import type { IntentCategory, PronounPair, Suggestion, TabId } from './types';
import {
  emitFillComposer,
  emitWidgetReady,
  listenHostMessages,
  requestDomMessagesFromHost,
} from './bridge/postMessage';
import {
  DEFAULT_PAIR,
  applyPronouns,
  rewriteSuggestionText,
} from './lib/applyPronouns';
import {
  createStudentMemory,
  createSuggestions,
  createTeacherReview,
  getConversationMessages,
  getConversationStudentLink,
  getStudentSummary,
  linkStudentToConversation,
  syncConversationHistory,
  confirmReviewSession,
  getStudentContext,
  logoutAppSession,
  resolveConversationByContext,
  saveStudentProfile,
  updateStudentCustomField,
  type ApiChatMessage,
  type StudentContextApi,
  type StudentIdentityApi,
  type StudentOptionApi,
  type StudentSummaryApi,
} from './lib/api';
import { getAppSession, getSessionToken } from './lib/session';

function toSuggestionList(
  items: Array<{ id: string; tone: string; content: string }>,
  pronouns: PronounPair,
): Suggestion[] {
  return items.map((item) => {
    const baseText = item.content;
    return {
      id: item.id,
      label: item.tone || 'Gợi ý',
      category: 'Khác' as const,
      baseText,
      text: rewriteSuggestionText(baseText, pronouns),
    };
  });
}

export default function App() {
  const [tab, setTab] = useState<TabId>('suggestions');
  const [studentName, setStudentName] = useState('Chưa xác định');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState('');
  const [pronouns, setPronouns] = useState<PronounPair>(DEFAULT_PAIR);
  const [studentContext, setStudentContext] = useState<StudentContextApi | null>(null);
  const [studentIdentity,setStudentIdentity]=useState<StudentIdentityApi|null>(null);
  const [studentOptions,setStudentOptions]=useState<StudentOptionApi[]>([]);
  const [studentSummary,setStudentSummary]=useState<StudentSummaryApi|null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [bridgeReady, setBridgeReady] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [contextQuote, setContextQuote] = useState('');
  const [contextIntents, setContextIntents] = useState<IntentCategory[]>([]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(() => Boolean(getSessionToken()));
  const [apiStatus, setApiStatus] = useState('Chưa gọi API gợi ý');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [clickBanner, setClickBanner] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [lastMessages, setLastMessages] = useState<ApiChatMessage[]>([]);

  const hasSessionRef = useRef(hasSession);
  const conversationIdRef = useRef(conversationId);
  const pageIdRef = useRef(pageId);
  const studentIdRef=useRef<string|null>(studentId);
  const studentRevisionRef=useRef<number|undefined>(undefined);
  const suggestionRequestRef = useRef(0);
  const contextResolveRef = useRef(0);
  useEffect(() => {
    for (const key of [
      'ai_settings_mode',
      'ai_provider',
      'ai_api_key',
      'ai_model',
      'ai_base_url',
      'ai_remember_key',
      'gemini_api_key',
      'gemini_model',
      'ttd_backend_api_base_url',
    ]) {
      try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
      try { sessionStorage.removeItem(key); } catch { /* storage may be unavailable */ }
    }
  }, []);
  useEffect(() => {
    hasSessionRef.current = hasSession;
  }, [hasSession]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    pageIdRef.current = pageId;
  }, [pageId]);
  useEffect(()=>{studentIdRef.current=studentId;studentRevisionRef.current=studentSummary?.revision},[studentId,studentSummary?.revision]);
  useEffect(() => {
    const handleSessionExpired = () => {
      setHasSession(false);
      setApiStatus('Phiên đăng nhập đã hết hạn. Bản nháp vẫn được giữ; vui lòng đăng nhập lại.');
    };
    window.addEventListener('ttd:session-expired', handleSessionExpired);
    return () => window.removeEventListener('ttd:session-expired', handleSessionExpired);
  }, []);

  const student = useMemo(
    () => ({
      id: studentContext?.studentId || '',
      initials: getInitials(studentName),
      name: studentName,
      statusLabel: contextLoading ? 'ĐANG TẢI' : studentContext ? 'ĐÃ ĐỒNG BỘ' : 'CHƯA CÓ HỒ SƠ',
      courseLabel: 'Chưa có thông tin khóa học',
      pronouns: `${pronouns.speaker} - ${pronouns.listener}`,
      channel: 'Pancake',
      note: studentContext?.profile.specialNotes || 'Chưa có lưu ý đặc biệt',
      profileFields:
        studentContext?.profile.fields.map((field) => ({ label: field.label, value: field.value || 'Chưa có thông tin' })) || [],
      notes: studentContext?.profile.studyNotes || '',
      memories:
        studentContext?.memories.filter((memory) => memory.status === 'active').map((memory) => memory.content) || []
    }),
    [contextLoading, pronouns.listener, pronouns.speaker, studentContext, studentName],
  );

  const loadSuggestionsFromApi = useCallback(async () => {
    const sessionOk = hasSessionRef.current;
    const convId = conversationIdRef.current;
    const pgId = pageIdRef.current;
    const requestNumber = ++suggestionRequestRef.current;

    // Always flip UI first so click never looks like a no-op.
    setLoadingSuggestions(true);
    setApiStatus('Đang lấy… (click nhận)');

    if (!sessionOk) {
      setLoadingSuggestions(false);
      setApiStatus('Cần login trước khi tạo gợi ý');
      return;
    }
    if (!convId) {
      setLoadingSuggestions(false);
      setApiStatus('Chưa có conversationId từ bridge — mở đúng hội thoại Pancake');
      return;
    }

    setApiStatus(`Đang lấy messages (A)… conv=${convId.slice(0, 8)}…`);
    try {
      let messages: ApiChatMessage[] = [];
      let source: 'api' | 'dom' = 'api';
      try {
        messages = await getConversationMessages(convId, pgId);
        if (!messages.length) throw new Error('API messages empty');
        const latest = [...messages].reverse().find((m) => m.text?.trim()) || messages[messages.length - 1];
        if (latest?.text?.trim()) setContextQuote(latest.text.trim().slice(0, 180));
        setContextIntents([]);
        setApiStatus(`A OK · ${messages.length} msg → suggestions…`);
      } catch (errA) {
        source = 'dom';
        setApiStatus(`A fail → DOM (${errA instanceof Error ? errA.message : 'error'})`);
        const domMessages = await requestDomMessagesFromHost();
        messages = domMessages.map((m) => ({
          id: m.id,
          conversationId: convId,
          sender: m.sender,
          senderName: m.senderName,
          text: m.text,
          createdAt: m.createdAt,
        }));
        if (!messages.length) throw new Error('DOM messages empty');
        const latest = [...messages].reverse().find((m) => m.text?.trim()) || messages[messages.length - 1];
        if (latest?.text?.trim()) setContextQuote(latest.text.trim().slice(0, 180));
        setContextIntents([]);
        setApiStatus(`B DOM OK · ${messages.length} msg → suggestions…`);
      }

      const result = await createSuggestions({
        conversationId: convId,
        studentId:studentIdRef.current||undefined,
        contextRevision:studentRevisionRef.current,
        messages: messages.map((m) => ({
          id: m.id,
          conversationId: convId,
          sender: m.sender,
          senderName: m.senderName,
          text: m.text,
          attachments: m.attachments || [],
          createdAt: m.createdAt,
        })),
      });
      if (requestNumber !== suggestionRequestRef.current || convId !== conversationIdRef.current) return;
      const next = toSuggestionList(result.suggestions || [], pronouns);
      if (!next.length) throw new Error('Suggestions empty');

      setSuggestions(next);
      setSelectedId(next[0]?.id ?? null);
      setActiveDraft(next[0]?.text ?? '');
      setUsingMock(Boolean(result.isDemoFallback));
      setLastMessages(messages);
      setApiStatus(`${result.isDemoFallback ? 'Dữ liệu dự phòng' : result.provider || 'AI'} (${source}) · ${next.length} gợi ý${result.isDemoFallback && result.analysis ? ' · ' + result.analysis : ''}`);
    } catch (err) {
      if (requestNumber !== suggestionRequestRef.current) return;
      const message = err instanceof Error ? err.message : 'error';
      setApiStatus(`Lỗi gợi ý: ${message}`);
    } finally {
      if (requestNumber === suggestionRequestRef.current) setLoadingSuggestions(false);
    }
  }, [pronouns]);

  useEffect(() => {
    emitWidgetReady();
    const applyConversationContext = (
      nextId: string,
      nextPageId: string | null,
      nextStudentName?: string | null,
    ) => {
      setConversationId((prev) => {
        if (prev && prev !== nextId) {
          suggestionRequestRef.current += 1;
          setSuggestions([]);
          setSelectedId(null);
          setActiveDraft('');
          setContextQuote('');
          setContextIntents([]);
          setUsingMock(false);
          setApiStatus('Đã đổi hội thoại — bấm tạo gợi ý');
          setClickBanner(null);
          setStudentContext(null);
          setStudentIdentity(null);
          setStudentOptions([]);
          setStudentSummary(null);
          setStudentId(null);
          setLastMessages([]);
          setContextError('');
        } else if (!prev) {
          setApiStatus('Sẵn sàng — bấm “Tạo gợi ý từ hội thoại”');
        }
        return nextId;
      });
      setPageId(nextPageId);
      setStudentId(null);
      setStudentIdentity(null);
      setStudentOptions([]);
      setStudentSummary(null);
      if (nextStudentName) setStudentName(nextStudentName);
    };

    return listenHostMessages((msg) => {
      if (msg.type === 'bridge-ready') {
        setBridgeReady(true);
        return;
      }
      if (msg.type === 'conversation-context') {
        const nextId = msg.conversationId;
        const resolvedPageId = msg.pageId || getAppSession()?.pageId || null;
        if (nextId) {
          contextResolveRef.current += 1;
          applyConversationContext(nextId, resolvedPageId, msg.studentName);
          return;
        }
        if (resolvedPageId && hasSessionRef.current) {
          const requestNumber = ++contextResolveRef.current;
          setApiStatus(`Đang đối chiếu hội thoại${msg.studentName ? ` của ${msg.studentName}` : ''}…`);
          void requestDomMessagesFromHost()
            .catch(() => [])
            .then((domMessages) => {
              const latest = [...domMessages].reverse().find((item) => item.text?.trim());
              const inferredName = msg.studentName || latest?.senderName || null;
              return resolveConversationByContext(resolvedPageId, {
                studentName: inferredName,
                latestMessage: latest?.text,
              });
            })
            .then((match) => {
              if (requestNumber !== contextResolveRef.current) return;
              if (!match) {
                setApiStatus('Không xác định được hội thoại đang mở — hãy bấm lại hội thoại trong Pancake');
                return;
              }
              applyConversationContext(
                match.id,
                match.pageId || resolvedPageId,
                match.customerName,
              );
            })
            .catch((error) => {
              if (requestNumber !== contextResolveRef.current) return;
              setApiStatus(`Không đối chiếu được hội thoại: ${error instanceof Error ? error.message : 'lỗi API'}`);
            });
          return;
        }
        contextResolveRef.current += 1;
        setPageId(resolvedPageId);
        if (msg.studentName) setStudentName(msg.studentName);
        setApiStatus('Chưa bắt được hội thoại — hãy bấm lại một hội thoại trong Pancake');
        return;
      }
      if (msg.type === 'pancake-access-token') {
        if (msg.accessToken?.trim()) setBridgeToken(msg.accessToken.trim());
        return;
      }
      if (msg.type === 'fill-composer-result') {
        setCopyHint(msg.ok ? 'Đã đổ vào ô soạn' : msg.error ? `Host: ${msg.error}` : 'Host chưa đổ được');
        window.setTimeout(() => setCopyHint(null), 2000);
      }
    });
  }, []);

  useEffect(() => {
    if (!hasSession) {
      setApiStatus('Chưa login — đăng nhập để tạo gợi ý live');
      return;
    }
    if (!conversationId) {
      setApiStatus('Đã login — chờ conversationId từ bridge (mở hội thoại Pancake)');
      return;
    }
    // Do not auto-fetch: only user click triggers loadSuggestionsFromApi (avoids Network loop).
    setApiStatus('Sẵn sàng — bấm “Tạo gợi ý từ hội thoại”');
  }, [hasSession, conversationId]);

  useEffect(() => {
    if (!hasSession || !conversationId || !pageId) return;
    const controller = new AbortController();
    setContextLoading(true);
    setContextError('');
    getConversationStudentLink(conversationId,pageId,controller.signal)
      .then(async ({identity,students}) => {
        if (controller.signal.aborted) return;
        setStudentIdentity(identity);setStudentOptions(students);
        if(!identity.student) {
          setStudentId(null);setStudentContext(null);setStudentSummary(null);
          setStudentName(identity.customerName||'Chưa xác định');
          return;
        }
        setStudentId(identity.student.id);setStudentName(identity.student.name);
        const [context,summary]=await Promise.all([
          getStudentContext({pageId,studentId:identity.student.id,studentName:identity.student.name,signal:controller.signal}),
          getStudentSummary(identity.student.id,controller.signal)
        ]);
        if (controller.signal.aborted) return;
        setStudentContext(context);setStudentSummary(summary);
        setStudentIdentity({...identity,student:{...identity.student,revision:summary.revision}});
        studentRevisionRef.current=summary.revision;
        setPronouns({speaker:context.profile.senderCall,listener:context.profile.recipientCall});
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setContextError(error instanceof Error ? error.message : 'Không tải được hồ sơ.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setContextLoading(false);
      });
    return () => controller.abort();
  }, [conversationId, hasSession, pageId]);

  const refreshStudentSummary=useCallback(async()=>{
    if(!studentId)return null;
    const summary=await getStudentSummary(studentId);
    setStudentSummary(summary);studentRevisionRef.current=summary.revision;
    setStudentIdentity((identity)=>identity?.student?.id===studentId?{...identity,student:{...identity.student,revision:summary.revision}}:identity);
    return summary;
  },[studentId]);

  const handleLinkStudent=useCallback(async(input:{studentId?:string;newStudentName?:string;importLegacyContext?:boolean})=>{
    const convId=conversationIdRef.current;const pgId=pageIdRef.current;
    if(!convId||!pgId)throw new Error('Chưa xác định hội thoại Pancake.');
    const result=await linkStudentToConversation({conversationId:convId,pageId:pgId,...input});
    setStudentIdentity(result.identity);setStudentOptions(result.students);
    const linked=result.identity.student;
    if(!linked){setStudentId(null);setStudentContext(null);setStudentSummary(null);return;}
    setStudentId(linked.id);setStudentName(linked.name);
    const [context,summary]=await Promise.all([
      getStudentContext({pageId:pgId,studentId:linked.id,studentName:linked.name}),getStudentSummary(linked.id)
    ]);
    setStudentContext(context);setStudentSummary(summary);studentRevisionRef.current=summary.revision;
    setStudentIdentity({...result.identity,student:{...linked,revision:summary.revision}});
    setPronouns({speaker:context.profile.senderCall,listener:context.profile.recipientCall});
  },[]);

  const handleSyncHistory=useCallback(async()=>{
    const convId=conversationIdRef.current;const pgId=pageIdRef.current;
    if(!convId||!pgId)throw new Error('Chưa xác định hội thoại Pancake.');
    const result=await syncConversationHistory({conversationId:convId,pageId:pgId,pages:3});
    const messages=await getConversationMessages(convId,pgId,50);
    setLastMessages(messages);await refreshStudentSummary();return result;
  },[refreshStudentSummary]);

  const handleConfirmReview=useCallback(async(reviewSessionId:string)=>{
    if(!studentId)throw new Error('Chưa chọn học viên.');
    await confirmReviewSession({studentId,reviewSessionId,confirmed:true,evidence:'Nhân viên xác nhận đã gửi nhận xét.'});
    await refreshStudentSummary();
  },[refreshStudentSummary,studentId]);

  const handlePronounsChange = (pair: PronounPair) => {
    const prevPair = pronouns;
    setPronouns(pair);
    setSuggestions((prev) =>
      prev.map((s) => ({
        ...s,
        text: rewriteSuggestionText(s.baseText, pair),
      })),
    );
    if (selectedId) {
      const base = suggestions.find((s) => s.id === selectedId)?.baseText;
      if (base) setActiveDraft(rewriteSuggestionText(base, pair));
    } else if (activeDraft) {
      setActiveDraft(applyPronouns(activeDraft, prevPair, pair));
    }

    if (studentContext) {
      const profile = {
        ...studentContext.profile,
        senderCall: pair.speaker,
        recipientCall: pair.listener,
        fields: studentContext.profile.fields.map((field) => {
          if (field.key === 'sender') return { ...field, value: pair.speaker, source: 'user_input' };
          if (field.key === 'recipient') return { ...field, value: pair.listener, source: 'user_input' };
          return field;
        }),
      };
      void saveStudentProfile({ context: studentContext, profile })
        .then(setStudentContext)
        .catch((error) => setContextError(error instanceof Error ? error.message : 'Không lưu được xưng hô.'));
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint('Đã copy');
    } catch {
      setCopyHint('Không copy được');
    }
    window.setTimeout(() => setCopyHint(null), 1500);
  };

  const handleSelectSuggestion = (id: string) => {
    setSelectedId(id);
    const sg = suggestions.find((s) => s.id === id);
    if (sg) setActiveDraft(sg.text);
  };

  const handleUsePhrase = (text: string) => {
    setSelectedId(null);
    setActiveDraft(text);
  };

  const handleGenerateGrade = async (note: string,assignmentId:string,assignmentTitle:string,reviewSessionKey:string) => {
    const convId = conversationIdRef.current;
    if (!convId) throw new Error('Chưa xác định hội thoại Pancake hiện tại.');
    let messages = lastMessages;
    if (!messages.length) {
      try {
        messages = await getConversationMessages(convId, pageIdRef.current);
      } catch {
        const domMessages = await requestDomMessagesFromHost();
        messages = domMessages.map((message) => ({
          ...message,
          conversationId: convId,
        }));
      }
      setLastMessages(messages);
    }
    const result = await createTeacherReview({
      conversationId: convId,
      teacherInput: note,
      pronouns,
      messages,
      studentId:studentId||undefined,
      contextRevision:studentSummary?.revision,
      assignmentId:assignmentId||undefined,
      assignmentTitle:assignmentTitle||undefined,
      reviewSessionKey,
    });
    await refreshStudentSummary();
    return {phrases:toSuggestionList(result.suggestions, pronouns),reviewSessionId:result.reviewSessionId||undefined};
  };

  const handleSaveNotes = async (value: string) => {
    if (!studentContext) throw new Error('Hồ sơ học viên chưa tải xong.');
    const context = await saveStudentProfile({
      context: studentContext,
      profile: {
        ...studentContext.profile,
        studyNotes: value,
        fields: studentContext.profile.fields.map((field) =>
          field.key === 'study'
            ? { ...field, value, source: value.trim() ? 'user_input' : 'empty' }
            : field,
        ),
      },
    });
    setStudentContext(context);
  };

  const handleAddMemory = async (value: string) => {
    if (!studentContext) throw new Error('Hồ sơ học viên chưa tải xong.');
    const context = await createStudentMemory({ context: studentContext, content: value });
    setStudentContext(context);
  };

  const handleCustomFieldChange = async (fieldId: string, value: string) => {
    if (!studentContext) throw new Error('Hồ sơ học viên chưa tải xong.');
    const context = await updateStudentCustomField({ context: studentContext, fieldId, value });
    setStudentContext(context);
  };


  const handleFill = () => {
    if (!activeDraft) return;
    emitFillComposer(activeDraft, `req-${Date.now()}`);
  };

  const handleLogout = () => {
    logoutAppSession();
    setHasSession(false);
    setUsingMock(false);
    setSuggestions([]);
    setApiStatus('Đã logout');
  };

  return (
    <div className="app-shell">
      <Header />
      {!hasSession ? (
        <LoginPanel bridgeToken={bridgeToken} onLoggedIn={() => setHasSession(true)} />
      ) : (
        <div className="api-status">
          <span>
            {apiStatus}
            {usingMock ? ' · mock' : ' · live'}
          </span>
          <button type="button" className="btn-logout-mini" onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}
      <div className="app-body">
        {contextLoading && <div className="inline-status" role="status">Đang tải hồ sơ học viên…</div>}
        {contextError && <div className="inline-error" role="alert">{contextError}</div>}
        <StudentCard student={student} pronouns={pronouns} onPronounsChange={handlePronounsChange} />
        <ContextStrip intents={contextIntents} quote={contextQuote || 'Chưa có trích dẫn — bấm tạo gợi ý để lấy tin mới nhất'} />
        <TabBar active={tab} onChange={setTab} />
        <div className="tab-content" role="tabpanel">
          {tab === 'suggestions' && (
            <>
              {clickBanner && (
                <div className="click-banner" role="status" aria-live="assertive">
                  {clickBanner}
                </div>
              )}
              <button
                type="button"
                className={`btn-refresh-suggestions${loadingSuggestions ? ' is-running' : ''}`}
                disabled={loadingSuggestions}
                title="Tạo gợi ý từ hội thoại (A BE → B DOM)"
                onClick={() => {
                  const stamp = new Date().toLocaleTimeString();
                  // Unmissable sync feedback in the same click tick.
                  setClickBanner(`CLICK OK · đang chạy… (${stamp})`);
                  setLoadingSuggestions(true);
                  setApiStatus(`Đang lấy… (click ${stamp})`);
                  void loadSuggestionsFromApi().finally(() => {
                    window.setTimeout(() => setClickBanner(null), 2500);
                  });
                }}
              >
                {loadingSuggestions ? 'Đang tạo gợi ý…' : 'Tạo gợi ý từ hội thoại'}
              </button>
              <SuggestionsTab
                suggestions={suggestions}
                selectedId={selectedId}
                onSelect={handleSelectSuggestion}
                onCopy={handleCopy}
              />
            </>
          )}
          {tab === 'student' && (
            <StudentTab
              student={student}
              pronouns={pronouns}
              onPronounsChange={handlePronounsChange}
              notes={studentContext?.profile.studyNotes || ''}
              memories={studentContext?.memories.filter((memory) => memory.status === 'active').map((memory) => memory.content) || []}
              customFields={studentContext?.profile.customFields.filter((field) => !field.hidden) || []}
              onSaveNotes={handleSaveNotes}
              onAddMemory={handleAddMemory}
              onCustomFieldChange={handleCustomFieldChange}
              identity={studentIdentity}
              students={studentOptions}
              summary={studentSummary}
              conversationId={conversationId || ''}
              messages={lastMessages}
              onLink={handleLinkStudent}
              onRefresh={refreshStudentSummary}
              onSyncHistory={handleSyncHistory}
            />
          )}
          {tab === 'grading' && (
            <GradingTab pronouns={pronouns} onUsePhrase={handleUsePhrase} onCopy={handleCopy} onGenerate={handleGenerateGrade}
              conversationId={conversationId} studentLinked={Boolean(studentIdentity?.status === 'linked' && studentId)} summary={studentSummary}
              onConfirmReview={handleConfirmReview} />
          )}
        </div>
      </div>
      {copyHint && <div className="toast">{copyHint}</div>}
      <FooterCta disabled={!activeDraft} onFill={handleFill} />
      <div className="bridge-flag" data-bridge-ready={bridgeReady ? '1' : '0'} hidden />
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || name === 'Chưa xác định') return '?';
  return parts.slice(-2).map((part) => part[0]?.toLocaleUpperCase('vi')).join('');
}
