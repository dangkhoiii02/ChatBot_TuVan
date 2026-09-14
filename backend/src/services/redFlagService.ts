import type { RedFlagsConfig } from './aiKnowledgeBase.js';
import { normalizeVietnamese } from './aiKnowledgeBase.js';

export type RedFlagCheck =
  | { isRed: false }
  | {
      isRed: true;
      category: string;
      keyword: string;
      instruction: string;
      reason: string;
    };

export function checkRedFlags(text: string, config: RedFlagsConfig): RedFlagCheck {
  const normalizedText = normalizeVietnamese(text);
  if (!normalizedText) return { isRed: false };

  for (const category of Object.values(config.categories || {})) {
    for (const keyword of category.keywords || []) {
      if (normalizedText.includes(normalizeVietnamese(keyword))) {
        const categoryName = category.name || 'Tình huống nhạy cảm';

        return {
          isRed: true,
          category: categoryName,
          keyword,
          instruction: category.instruction || '',
          reason: `Phát hiện từ khóa nhạy cảm cờ đỏ [${keyword}] thuộc nhóm "${categoryName}". Cần ưu tiên an ủi, tôn trọng quyết định, BẮT BUỘC người thật duyệt.`
        };
      }
    }
  }

  return { isRed: false };
}
