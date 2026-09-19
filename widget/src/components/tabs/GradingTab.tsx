import { useEffect, useState } from 'react';
import type { PronounPair, Suggestion } from '../../types';
import { SuggestionCard } from '../SuggestionCard';

interface Props {
  pronouns: PronounPair;
  onUsePhrase: (text: string) => void;
  onCopy: (text: string) => void;
  onGenerate: (note: string) => Promise<Suggestion[]>;
}

export function GradingTab({ pronouns, onUsePhrase, onCopy, onGenerate }: Props) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [phrases, setPhrases] = useState<Suggestion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Results are tied to the pronoun pair sent to the backend; regenerate after a change.
  useEffect(() => {
    setPhrases(null);
    setSelectedId(null);
  }, [pronouns.listener, pronouns.speaker]);

  const compose = async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('Hãy nhập nhận xét chuyên môn trước khi soạn cách nói.');
      return;
    }
    setLoading(true);
    setPhrases(null);
    setSelectedId(null);
    setError('');
    try {
      setPhrases(await onGenerate(trimmed));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tạo được nhận xét.');
    } finally {
      setLoading(false);
    }
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
      {error && <div className="inline-error" role="alert">{error}</div>}

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
          Nhập nhận xét của giáo viên rồi bấm “Soạn cách nói”. AI không tự xem video.
        </div>
      )}
    </div>
  );
}
