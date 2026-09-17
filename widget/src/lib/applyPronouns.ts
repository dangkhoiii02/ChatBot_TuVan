import type { PronounPair } from '../types';

export const DEFAULT_PAIR: PronounPair = { speaker: 'Thầy', listener: 'Em' };

export const PRESETS: PronounPair[] = [
  { speaker: 'Thầy', listener: 'Em' },
  { speaker: 'Em', listener: 'Chị' },
  { speaker: 'Thầy', listener: 'Chị' },
  { speaker: 'Em', listener: 'Anh' },
  { speaker: 'Thầy', listener: 'Anh' },
];

export function formatPair(p: PronounPair): string {
  return `${p.speaker} - ${p.listener}`;
}

const ROLE_CASE: Record<string, { cap: string; low: string }> = {
  Thầy: { cap: 'Thầy', low: 'thầy' },
  thầy: { cap: 'Thầy', low: 'thầy' },
  Em: { cap: 'Em', low: 'em' },
  em: { cap: 'Em', low: 'em' },
  Chị: { cap: 'Chị', low: 'chị' },
  chị: { cap: 'Chị', low: 'chị' },
  Anh: { cap: 'Anh', low: 'anh' },
  anh: { cap: 'Anh', low: 'anh' },
};

function roleForms(word: string): { cap: string; low: string } {
  const known = ROLE_CASE[word] ?? ROLE_CASE[word.toLowerCase()];
  if (known) return known;
  const low = word.toLowerCase();
  const cap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  return { cap, low };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace whole-word-ish Vietnamese role words using unicode letter boundaries.
 * Longer/specific roles first; placeholders avoid double-replace.
 */
export function applyPronouns(text: string, from: PronounPair, to: PronounPair): string {
  if (!text) return text;
  if (from.speaker === to.speaker && from.listener === to.listener) return text;

  const fromSpeaker = roleForms(from.speaker);
  const fromListener = roleForms(from.listener);
  const toSpeaker = roleForms(to.speaker);
  const toListener = roleForms(to.listener);

  const roles: Array<{ forms: { cap: string; low: string }; phCap: string; phLow: string }> = [
    { forms: fromSpeaker, phCap: '__SP_CAP__', phLow: '__SP_LOW__' },
    { forms: fromListener, phCap: '__LI_CAP__', phLow: '__LI_LOW__' },
  ];
  roles.sort(
    (a, b) =>
      Math.max(b.forms.cap.length, b.forms.low.length) -
      Math.max(a.forms.cap.length, a.forms.low.length),
  );

  let out = text;
  for (const role of roles) {
    const alts = Array.from(new Set([role.forms.cap, role.forms.low]));
    const pattern = new RegExp(
      `(^|[^\\p{L}])(${alts.map(escapeRegExp).join('|')})(?=[^\\p{L}]|$)`,
      'gu',
    );
    out = out.replace(pattern, (_m, prefix: string, matched: string) => {
      const ph = matched === role.forms.low ? role.phLow : role.phCap;
      return `${prefix}${ph}`;
    });
  }

  out = out.split('__SP_CAP__').join(toSpeaker.cap);
  out = out.split('__SP_LOW__').join(toSpeaker.low);
  out = out.split('__LI_CAP__').join(toListener.cap);
  out = out.split('__LI_LOW__').join(toListener.low);

  return out;
}

export function rewriteSuggestionText(baseText: string, pair: PronounPair): string {
  return applyPronouns(baseText, DEFAULT_PAIR, pair);
}
