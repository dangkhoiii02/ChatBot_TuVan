import type { ChatMessage, SuggestionResult } from '../types/api.js';
import { config } from '../config.js';
import { createGeminiSuggestions } from './geminiSuggestionProvider.js';

export type CreateSuggestionsInput = {
  conversationId: string;
  messages: Array<Pick<ChatMessage, 'sender' | 'text' | 'createdAt'>>;
};

const assignmentKeywords = ['clip', 'video', 'bai tap', 'bài tập', 'ngon', 'ngón', 'phim', 'phím', 'rotation'];
const sensitiveKeywords = ['ung thu', 'ung thư', 'nam vien', 'nằm viện', 'tram cam', 'trầm cảm', 'mat nguoi than', 'mất người thân'];

export async function createSuggestions(input: CreateSuggestionsInput): Promise<SuggestionResult> {
  if (config.ai.provider === 'gemini') {
    try {
      return await createGeminiSuggestions(input);
    } catch (error) {
      console.error('Gemini suggestion failed, fallback to mock:', error);
      return {
        ...createMockSuggestions(input),
        provider: 'mock',
        isDemoFallback: true,
        analysis: `Gemini chưa tạo được gợi ý hợp lệ, hệ thống tạm dùng gợi ý mock để demo không bị gián đoạn. Chi tiết: ${getErrorMessage(error)}`
      };
    }
  }

  return {
    ...createMockSuggestions(input),
    provider: 'mock'
  };
}

function createMockSuggestions(input: CreateSuggestionsInput): SuggestionResult {
  const latestStudentText = [...input.messages].reverse().find((message) => message.sender === 'student')?.text ?? '';
  const normalizedText = normalizeVietnamese(latestStudentText);

  if (hasKeyword(normalizedText, sensitiveKeywords)) {
    return {
      intent: 'sensitive',
      sensitivity: 'do',
      flagReason: 'Mock heuristic phát hiện nội dung nhạy cảm.',
      suggestions: [
        {
          id: `sug-${input.conversationId}-1`,
          tone: 'Than trong va dong cam',
          content:
            'Thầy nghe tình hình của mình và rất chia sẻ nè. Trước mắt mình cứ ưu tiên sức khỏe và tinh thần đã nha, chuyện bài vở mình để sau cũng được.'
        },
        {
          id: `sug-${input.conversationId}-2`,
          tone: 'Ngan gon',
          content:
            'Không sao đâu em, lúc này sức khỏe là quan trọng nhất. Em cứ ổn định trước, khi nào thuận tiện mình nói tiếp chuyện học nha.'
        }
      ]
    };
  }

  if (hasKeyword(normalizedText, assignmentKeywords)) {
    return {
      intent: 'assignment_feedback',
      sensitivity: 'vang',
      flagReason: 'Mock heuristic phát hiện ngữ cảnh chấm bài hoặc hỏi bài tập.',
      suggestions: [
        {
          id: `sug-${input.conversationId}-1`,
          tone: 'Nhan xet ky thuat',
          content:
            'Thầy xem bài rồi nè. Đoạn này mình tập chậm lại một chút, để ý tay thả lỏng và giữ chuyển động đều hơn trước khi tăng tốc nha.'
        },
        {
          id: `sug-${input.conversationId}-2`,
          tone: 'Cu the de luyen tap',
          content:
            'Em tách riêng đoạn đang vấp ra tập lặp lại vài lần trước nha. Khi tay quen rồi mình mới ráp lại cả câu, vậy sẽ chắc và đỡ bị gồng hơn.'
        },
        {
          id: `sug-${input.conversationId}-3`,
          tone: 'Khich le',
          content:
            'Bài này có tiến bộ đó em. Mình chỉ cần sửa thêm chỗ chuyển ngón cho mượt hơn là câu nhạc sẽ nghe liền mạch hơn nhiều nè.'
        }
      ]
    };
  }

  return {
    intent: 'check_in',
    sensitivity: 'xanh',
    flagReason: 'Mock heuristic phân loại hội thoại hỏi thăm/check-in.',
    suggestions: [
      {
        id: `sug-${input.conversationId}-1`,
        tone: 'Am ap',
        content:
          'Dạo này em tập đến đâu rồi nè? Nếu đang bận quá thì mình chỉ cần dành 10-15 phút chạm phím mỗi ngày cũng tốt rồi nha.'
      },
      {
        id: `sug-${input.conversationId}-2`,
        tone: 'Ngan gon',
        content: 'Hi em, hôm nay mình có kẹt đoạn nào trong bài không? Có gì gửi thầy xem rồi thầy gỡ giúp nha.'
      },
      {
        id: `sug-${input.conversationId}-3`,
        tone: 'Dong vien',
        content:
          'Không cần vội đâu em, mình giữ nhịp tập đều đều là được. Có 15 phút rảnh thì ghé qua đàn một chút cho tay không quên cảm giác nha.'
      }
    ]
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi không xác định';
}

function hasKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeVietnamese(keyword)));
}

function normalizeVietnamese(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}
