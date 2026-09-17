import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { StudentCard } from './components/StudentCard';
import { ContextStrip } from './components/ContextStrip';
import { TabBar } from './components/TabBar';
import { FooterCta } from './components/FooterCta';
import { LoginPanel } from './components/LoginPanel';
import { SuggestionsTab } from './components/tabs/SuggestionsTab';
import { StudentTab } from './components/tabs/StudentTab';
import { GradingTab } from './components/tabs/GradingTab';
import {
  MOCK_CONTEXT_INTENTS,
  MOCK_CONTEXT_QUOTE,
  MOCK_STUDENT,
  MOCK_SUGGESTIONS,
} from './data/mockStudent';
import type { PronounPair, Suggestion, TabId } from './types';
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
  createSuggestions,
  getConversationMessages,
  logoutAppSession,
  type ApiChatMessage,
} from './lib/api';
import { getSessionToken } from './lib/session';

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
  const [studentName, setStudentName] = useState(MOCK_STUDENT.name);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(MOCK_SUGGESTIONS);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_SUGGESTIONS[0]?.id ?? null);
  const [activeDraft, setActiveDraft] = useState(MOCK_SUGGESTIONS[0]?.text ?? '');
  const [pronouns, setPronouns] = useState<PronounPair>(DEFAULT_PAIR);
  const [notes, setNotes] = useState(MOCK_STUDENT.notes);
  const [memories, setMemories] = useState<string[]>(MOCK_STUDENT.memories);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(() => Boolean(getSessionToken()));
  const [apiStatus, setApiStatus] = useState('Chưa gọi API gợi ý');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [usingMock, setUsingMock] = useState(true);

  const student = useMemo(
    () => ({ ...MOCK_STUDENT, name: studentName }),
    [studentName],
  );

  const loadSuggestionsFromApi = useCallback(async () => {
    if (!hasSession) {
      setApiStatus('Cần login trước');
      return;
    }
    if (!conversationId) {
      setApiStatus('Chưa có conversationId từ bridge');
      return;
    }

    setLoadingSuggestions(true);
    setApiStatus('Đang lấy messages + gợi ý…');
    try {
      let messages: ApiChatMessage[] = [];
      let source: 'api' | 'dom' = 'api';
      try {
        messages = await getConversationMessages(conversationId, pageId);
        if (!messages.length) throw new Error('API messages empty');
      } catch (errA) {
        source = 'dom';
        setApiStatus(`A fail → DOM (${errA instanceof Error ? errA.message : 'error'})`);
        const domMessages = await requestDomMessagesFromHost();
        messages = domMessages.map((m) => ({
          id: m.id,
          conversationId,
          sender: m.sender,
          senderName: m.senderName,
          text: m.text,
          createdAt: m.createdAt,
        }));
        if (!messages.length) throw new Error('DOM messages empty');
      }

      const result = await createSuggestions({
        conversationId,
        messages: messages.map((m) => ({
          id: m.id,
          conversationId,
          sender: m.sender,
          senderName: m.senderName,
          text: m.text,
          attachments: m.attachments || [],
          createdAt: m.createdAt,
        })),
      });
      const next = toSuggestionList(result.suggestions || [], pronouns);
      if (!next.length) throw new Error('Suggestions empty');

      setSuggestions(next);
      setSelectedId(next[0]?.id ?? null);
      setActiveDraft(next[0]?.text ?? '');
      setUsingMock(false);
      setApiStatus(`OK (${source}) · ${messages.length} msg · ${next.length} gợi ý`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      // Keep current list; surface error instead of silent mock swap.
      setApiStatus(`Lỗi gợi ý: ${message}`);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [conversationId, hasSession, pageId, pronouns]);

  useEffect(() => {
    emitWidgetReady();
    return listenHostMessages((msg) => {
      if (msg.type === 'bridge-ready') {
        setBridgeReady(true);
        return;
      }
      if (msg.type === 'conversation-context') {
        setConversationId(msg.conversationId);
        setPageId(msg.pageId ?? null);
        if (msg.studentName) setStudentName(msg.studentName);
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
    void loadSuggestionsFromApi();
  }, [hasSession, conversationId, loadSuggestionsFromApi]);

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


  const handleFill = () => {
    if (!activeDraft) return;
    emitFillComposer(activeDraft, `req-${Date.now()}`);
  };

  const handleLogout = () => {
    logoutAppSession();
    setHasSession(false);
    setUsingMock(true);
    setSuggestions(MOCK_SUGGESTIONS);
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
        <StudentCard student={student} pronouns={pronouns} onPronounsChange={handlePronounsChange} />
        <ContextStrip intents={MOCK_CONTEXT_INTENTS} quote={MOCK_CONTEXT_QUOTE} />
        <TabBar active={tab} onChange={setTab} />
        <div className="tab-content" role="tabpanel">
          {tab === 'suggestions' && (
            <>
              <button
                type="button"
                className="btn-refresh-suggestions"
                disabled={loadingSuggestions || !hasSession || !conversationId}
                title={
                  !hasSession
                    ? 'Cần login trước'
                    : !conversationId
                      ? 'Chưa có conversationId từ bridge'
                      : 'Tạo gợi ý từ hội thoại (A BE → B DOM)'
                }
                onClick={() => {
                  if (!hasSession) {
                    setApiStatus('Cần login trước khi tạo gợi ý');
                    return;
                  }
                  if (!conversationId) {
                    setApiStatus('Chưa có conversationId từ bridge — mở đúng hội thoại Pancake');
                    return;
                  }
                  void loadSuggestionsFromApi();
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
              notes={notes}
              memories={memories}
              onNotesChange={setNotes}
              onAddMemory={(value) => setMemories((prev) => [...prev, value])}
            />
          )}
          {tab === 'grading' && (
            <GradingTab pronouns={pronouns} onUsePhrase={handleUsePhrase} onCopy={handleCopy} />
          )}
        </div>
      </div>
      {copyHint && <div className="toast">{copyHint}</div>}
      <FooterCta disabled={!activeDraft} onFill={handleFill} />
      <div className="bridge-flag" data-bridge-ready={bridgeReady ? '1' : '0'} hidden />
    </div>
  );
}
