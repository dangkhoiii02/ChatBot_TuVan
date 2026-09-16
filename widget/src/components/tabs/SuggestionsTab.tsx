import { SuggestionCard } from '../SuggestionCard';
import type { Suggestion } from '../../types';

interface Props {
  suggestions: Suggestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCopy: (text: string) => void;
  onCreate: () => void;
}

export function SuggestionsTab({ suggestions, selectedId, onSelect, onCopy, onCreate }: Props) {
  return (
    <div className="tab-panel">
      <button type="button" className="btn btn-outline create-btn" onClick={onCreate}>
        ✨ Tạo gợi ý mới
      </button>

      {suggestions.length === 0 ? (
        <div className="empty-state">Chưa có gợi ý. Bấm “Tạo gợi ý mới”.</div>
      ) : (
        <div className="suggestion-list">
          {suggestions.map((sg, i) => (
            <SuggestionCard
              key={sg.id}
              suggestion={sg}
              index={i + 1}
              selected={selectedId === sg.id}
              onSelect={() => onSelect(sg.id)}
              onCopy={() => onCopy(sg.text)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
