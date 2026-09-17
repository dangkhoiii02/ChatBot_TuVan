import { SuggestionCard } from '../SuggestionCard';
import type { Suggestion } from '../../types';

interface Props {
  suggestions: Suggestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCopy: (text: string) => void;
}

export function SuggestionsTab({ suggestions, selectedId, onSelect, onCopy }: Props) {
  return (
    <div className="tab-panel">
      {suggestions.length === 0 ? (
        <div className="empty-state">Chưa có gợi ý. Bấm “Tạo gợi ý từ hội thoại”.</div>
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
