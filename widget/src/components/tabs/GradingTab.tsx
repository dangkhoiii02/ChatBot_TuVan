import { useEffect, useState } from 'react';
import type { PronounPair, Suggestion } from '../../types';
import { emptyGradePhrase, mockGradePhrases } from '../../lib/mockGradePhrases';
import { DEFAULT_PAIR, applyPronouns } from '../../lib/applyPronouns';
import { SuggestionCard } from '../SuggestionCard';

interface Props {
  pronouns: PronounPair;
  onUsePhrase: (text: string) => void;
  onCopy: (text: string) => void;
}

export function GradingTab({ pronouns, onUsePhrase, onCopy }: Props) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [phrases, setPhrases] = useState<Suggestion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Re-apply pronouns to existing phrase cards when pair changes
  useEffect(() => {
    setPhrases((prev) => {
      if (!prev) return prev;
      return prev.map((p) => ({
        ...p,
        text: applyPronouns(p.baseText, DEFAULT_PAIR, pronouns),
      }));
    });
  }, [pronouns]);

  const compose = () => {
    setLoading(true);
    setPhrases(null);
    setSelectedId(null);
    window.setTimeout(() => {
      const trimmed = note.trim();
      if (!trimmed) {
        setPhrases([emptyGradePhrase(pronouns)]);
      } else {
        setPhrases(mockGradePhrases(trimmed, pronouns));
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="tab-panel grading-tab">
      <label className="field-block">
        <span className="field-label">Nhận xét của thầy (AI chưa xem video)</span>
        <textarea
          className="textarea"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Sai nhịp đoạn điệp khúc"
        />
      </label>
      <button type="button" className="btn btn-outline" disabled={loading} onClick={compose}>
        {loading ? 'Đang soạn…' : 'Soạn cách nói'}
      </button>

      {loading && <div className="empty-state">AI đang soạn 3 cách nói…</div>}

      {!loading && phrases && (
        <div className="suggestion-list">
          {phrases.map((sg, i) => (
            <SuggestionCard
              key={sg.id}
              suggestion={sg}
              index={i + 1}
              selected={selectedId === sg.id}
              onSelect={() => {
                setSelectedId(sg.id);
                onUsePhrase(sg.text);
              }}
              onCopy={() => onCopy(sg.text)}
            />
          ))}
        </div>
      )}

      {!loading && !phrases && (
        <div className="empty-state">
          Nhập nhận xét (hoặc để trống) rồi bấm “Soạn cách nói”.
        </div>
      )}
    </div>
  );
}
