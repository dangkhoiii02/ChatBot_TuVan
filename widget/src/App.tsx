import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { StudentCard } from './components/StudentCard';
import { ContextStrip } from './components/ContextStrip';
import { TabBar } from './components/TabBar';
import { FooterCta } from './components/FooterCta';
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
} from './bridge/postMessage';
import { DEFAULT_PAIR, applyPronouns, rewriteSuggestionText } from './lib/applyPronouns';

export default function App() {
  const [tab, setTab] = useState<TabId>('suggestions');
  const [studentName, setStudentName] = useState(MOCK_STUDENT.name);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(MOCK_SUGGESTIONS);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_SUGGESTIONS[0]?.id ?? null);
  const [activeDraft, setActiveDraft] = useState<string>(MOCK_SUGGESTIONS[0]?.text ?? '');
  const [pronouns, setPronouns] = useState<PronounPair>(DEFAULT_PAIR);
  const [notes, setNotes] = useState(MOCK_STUDENT.notes);
  const [memories, setMemories] = useState<string[]>(MOCK_STUDENT.memories);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const student = useMemo(
    () => ({ ...MOCK_STUDENT, name: studentName }),
    [studentName],
  );

  useEffect(() => {
    emitWidgetReady();
    const stop = listenHostMessages((msg) => {
      if (msg.type === 'bridge-ready') {
        setBridgeReady(true);
        return;
      }
      if (msg.type === 'conversation-context') {
        if (msg.studentName) {
          setStudentName(msg.studentName);
        }
        return;
      }
      if (msg.type === 'fill-composer-result') {
        if (!msg.ok) {
          setCopyHint(msg.error ? `Host: ${msg.error}` : 'Host chưa đổ được câu');
        } else {
          setCopyHint('Đã đổ vào ô soạn');
        }
        window.setTimeout(() => setCopyHint(null), 2000);
      }
    });
    return stop;
  }, []);

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

  const handleCreate = () => {
    const nextIndex = suggestions.length + 1;
    const baseText = `Em ơi, thầy vừa tạo gợi ý #${nextIndex}. Em xem giúp thầy nhé.`;
    const created: Suggestion = {
      id: `sg-${Date.now()}`,
      label: 'Khác',
      category: 'Khác',
      baseText,
      text: rewriteSuggestionText(baseText, pronouns),
    };
    setSuggestions((prev) => [created, ...prev]);
    setSelectedId(created.id);
    setActiveDraft(created.text);
  };

  const handleFill = () => {
    if (!activeDraft) return;
    const requestId = `req-${Date.now()}`;
    emitFillComposer(activeDraft, requestId);
  };

  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <StudentCard
          student={student}
          pronouns={pronouns}
          onPronounsChange={handlePronounsChange}
        />
        <ContextStrip intents={MOCK_CONTEXT_INTENTS} quote={MOCK_CONTEXT_QUOTE} />
        <TabBar active={tab} onChange={setTab} />
        <div className="tab-content" role="tabpanel">
          {tab === 'suggestions' && (
            <SuggestionsTab
              suggestions={suggestions}
              selectedId={selectedId}
              onSelect={handleSelectSuggestion}
              onCopy={handleCopy}
              onCreate={handleCreate}
            />
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
            <GradingTab
              pronouns={pronouns}
              onUsePhrase={handleUsePhrase}
              onCopy={handleCopy}
            />
          )}
        </div>
      </div>
      {copyHint && <div className="toast">{copyHint}</div>}
      <FooterCta disabled={!activeDraft} onFill={handleFill} />
      <div className="bridge-flag" data-bridge-ready={bridgeReady ? '1' : '0'} hidden />
    </div>
  );
}
