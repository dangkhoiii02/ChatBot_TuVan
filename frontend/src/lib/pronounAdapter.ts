import type { PronounPair } from '../types';

/**
 * Heals any words corrupted by previous naive substring replacement
 * (e.g. 'em' inside 'xem' turning into 'xchị', or 'tempo' turning into 'tchịpo').
 */
export function cleanCorruptions(text: string): string {
  if (!text) return text;
  const ub = (word: string) =>
    new RegExp(`(?<=^|[^\\p{L}\\p{N}_])${word}(?=$|[^\\p{L}\\p{N}_])`, 'gui');

  return text
    .replace(ub('xchị'), 'xem')
    .replace(ub('xthầy'), 'xem')
    .replace(ub('xanh'), 'xem')
    .replace(ub('xbạn'), 'xem')
    .replace(ub('tchịpo'), 'tempo')
    .replace(ub('tthầypo'), 'tempo')
    .replace(ub('tanhpo'), 'tempo')
    .replace(ub('tbạnpo'), 'tempo')
    .replace(ub('đchị'), 'đem')
    .replace(ub('đthầy'), 'đem')
    .replace(ub('kchị'), 'kèm')
    .replace(ub('kthầy'), 'kèm')
    .replace(ub('nhchị'), 'nhanh')
    .replace(ub('nhthầy'), 'nhanh');
}

/**
 * Safely adapts pronouns in a text from oldPair to newPair.
 * Uses Unicode-aware word boundaries and single-pass substitution
 * to prevent:
 * 1. Substring corruption (e.g. 'xem' -> 'xchị', 'tempo' -> 'tchịpo')
 * 2. Cross-contamination / double replacement (e.g. 'Thầy' -> 'Em' -> 'Chị')
 * 3. Case mismatches (preserves ALL CAPS, Title Case, lowercase)
 */
export function adaptPronouns(
  text: string,
  oldPair: PronounPair,
  newPair: PronounPair
): string {
  if (!text) return text;

  // 1. Heal any existing corruption first
  let cleaned = cleanCorruptions(text);

  const oldSender = oldPair.senderCall?.trim();
  const newSender = newPair.senderCall?.trim();
  const oldRecipient = oldPair.recipientCall?.trim();
  const newRecipient = newPair.recipientCall?.trim();

  // If no change needed, return cleaned text
  if (oldSender === newSender && oldRecipient === newRecipient) {
    return cleaned;
  }

  // 2. Build single-pass token map
  const tokenMap = new Map<string, string>();

  if (oldSender && newSender && oldSender.toLowerCase() !== newSender.toLowerCase()) {
    tokenMap.set(oldSender.toLowerCase(), newSender);
  }

  if (oldRecipient && newRecipient && oldRecipient.toLowerCase() !== newRecipient.toLowerCase()) {
    tokenMap.set(oldRecipient.toLowerCase(), newRecipient);
  }

  if (tokenMap.size === 0) {
    return cleaned;
  }

  // 3. Create Unicode word-boundary regex matching only standalone pronoun words
  const wordsToMatch = Array.from(tokenMap.keys())
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);

  // Unicode letter/number boundary:
  // Preceded by start of string or non-(Letter/Number/Underscore)
  // Followed by end of string or non-(Letter/Number/Underscore)
  const regex = new RegExp(
    `(?<=^|[^\\p{L}\\p{N}_])(${wordsToMatch.join('|')})(?=$|[^\\p{L}\\p{N}_])`,
    'gui'
  );

  return cleaned.replace(regex, (match) => {
    const replacement = tokenMap.get(match.toLowerCase());
    if (!replacement) return match;

    // Preserve casing
    if (match === match.toUpperCase() && match.length > 1) {
      return replacement.toUpperCase();
    }
    if (match[0] === match[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement.toLowerCase();
  });
}
