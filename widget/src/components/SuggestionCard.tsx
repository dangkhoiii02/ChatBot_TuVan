import type { Suggestion } from '../types';

interface Props {
  suggestion: Suggestion;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onCopy: () => void;
}

export function SuggestionCard({ suggestion, index, selected, onSelect, onCopy }: Props) {
  return (
    <article className={`suggestion-card ${selected ? 'selected' : ''}`}>
      <div className="suggestion-head">
        <span className="suggestion-label">{suggestion.label}</span>
        <span className="suggestion-index">Gợi ý #{index}</span>
      </div>
      <p className="suggestion-text">{suggestion.text}</p>
      <div className="suggestion-actions">
        <button type="button" className="btn btn-secondary" onClick={onCopy}>
          Copy
        </button>
        <button type="button" className="btn btn-secondary btn-use" onClick={onSelect}>
          Dùng câu này
        </button>
      </div>
    </article>
  );
}
