import { useEffect, useState } from 'react';
import type { PronounPair } from '../types';
import { PRESETS, formatPair } from '../lib/applyPronouns';

interface Props {
  value: PronounPair;
  onChange: (pair: PronounPair) => void;
  compact?: boolean;
}

export function PronounBar({ value, onChange, compact }: Props) {
  const [listenerDraft, setListenerDraft] = useState(value.listener);
  const [speakerDraft, setSpeakerDraft] = useState(value.speaker);

  useEffect(() => {
    setListenerDraft(value.listener);
    setSpeakerDraft(value.speaker);
  }, [value.listener, value.speaker]);

  const commitField = (field: 'listener' | 'speaker', draft: string) => {
    const trimmed = draft.trim();
    const nextValue = trimmed || value[field];
    if (field === 'listener') setListenerDraft(nextValue);
    else setSpeakerDraft(nextValue);
    if (nextValue !== value[field]) {
      onChange({ ...value, [field]: nextValue });
    }
  };

  const applyPreset = (pair: PronounPair) => {
    setListenerDraft(pair.listener);
    setSpeakerDraft(pair.speaker);
    onChange(pair);
  };

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
              onClick={() => applyPreset(p)}
            >
              {formatPair(p)}
            </button>
          );
        })}
      </div>
      <div className="pronoun-selects">
        <label className="pronoun-select">
          <span>Gọi</span>
          <input
            type="text"
            value={listenerDraft}
            placeholder={value.listener}
            aria-label="Gọi"
            onChange={(e) => setListenerDraft(e.target.value)}
            onBlur={() => commitField('listener', listenerDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitField('listener', listenerDraft);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
        <label className="pronoun-select">
          <span>Xưng</span>
          <input
            type="text"
            value={speakerDraft}
            placeholder={value.speaker}
            aria-label="Xưng"
            onChange={(e) => setSpeakerDraft(e.target.value)}
            onBlur={() => commitField('speaker', speakerDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitField('speaker', speakerDraft);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}
