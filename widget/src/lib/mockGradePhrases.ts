import type { PronounPair, Suggestion } from '../types';
import { DEFAULT_PAIR, applyPronouns } from './applyPronouns';

/** Soft card when teacher submits empty note (no specialty comment yet). */
export function emptyGradePhrase(pair: PronounPair): Suggestion {
  const baseText =
    'Em ơi, thầy đã nhận bài của em rồi nhé. Thầy sẽ xem kỹ và nhận xét chuyên môn sau.';
  return {
    id: 'grade-empty',
    label: 'Tiếp nhận',
    category: 'Chấm bài',
    baseText,
    text: applyPronouns(baseText, DEFAULT_PAIR, pair),
  };
}

/**
 * Mock: 3 phrasings with different tones, SAME facts from `note` only.
 * Authored in Thầy/Em then rewritten to `pair`. Does not invent technique.
 */
export function mockGradePhrases(note: string, pair: PronounPair): Suggestion[] {
  const fact = note.trim();
  const bases: Array<Omit<Suggestion, 'text'>> = [
    {
      id: 'grade-gan-gui',
      label: 'Gần gũi',
      category: 'Chấm bài',
      baseText: `Em ơi, thầy xem rồi. Về phần “${fact}” thì em lưu ý giúp thầy nhé, mình chỉnh lại cho đúng là được.`,
    },
    {
      id: 'grade-ro-rang',
      label: 'Rõ ràng',
      category: 'Chấm bài',
      baseText: `Em cần chú ý: ${fact}. Em xem lại đoạn đó và chỉnh theo nhận xét này giúp thầy.`,
    },
    {
      id: 'grade-dong-vien',
      label: 'Động viên',
      category: 'Chấm bài',
      baseText: `Em làm tốt phần còn lại rồi. Chỉ cần sửa thêm “${fact}” là ổn. Em cố thêm một chút, thầy tin em làm được.`,
    },
  ];

  return bases.map((b) => ({
    ...b,
    text: applyPronouns(b.baseText, DEFAULT_PAIR, pair),
  }));
}
