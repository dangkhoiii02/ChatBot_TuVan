import type { PronounPair } from '../types';
import { PRESETS, formatPair } from '../lib/applyPronouns';

const LISTENERS = Array.from(new Set(PRESETS.map((p) => p.listener)));
const SPEAKERS = Array.from(new Set(PRESETS.map((p) => p.speaker)));

interface Props {
  value: PronounPair;
  onChange: (pair: PronounPair) => void;
  compact?: boolean;
}

export function PronounBar({ value, onChange, compact }: Props) {
  return (
    <div className={`pronoun-bar ${compact ? 'pronoun-bar-compact' : ''}`}>
      <div className="pronoun-bar-label">Xưng hô</div>
      <div className="pronoun-chips" role="list">
        {PRESETS.map((p) => {
          const active = p.speaker === value.speaker && p.listener === value.listener;
          return (
            <button
              key={formatPair(p)}
              type="button"
              role="listitem"
              className={`pronoun-chip ${active ? 'active' : ''}`}
              onClick={() => onChange(p)}
            >
              {formatPair(p)}
            </button>
          );
        })}
      </div>
      <div className="pronoun-selects">
        <label className="pronoun-select">
          <span>Gọi</span>
          <select
            value={value.listener}
            onChange={(e) => onChange({ ...value, listener: e.target.value })}
          >
            {LISTENERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="pronoun-select">
          <span>Xưng</span>
          <select
            value={value.speaker}
            onChange={(e) => onChange({ ...value, speaker: e.target.value })}
          >
            {SPEAKERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
