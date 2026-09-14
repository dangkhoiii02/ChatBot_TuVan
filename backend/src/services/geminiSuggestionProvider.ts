import { config } from '../config.js';
import type { ChatMessage, SuggestionIntent, SuggestionResult } from '../types/api.js';
import {
  type FewShotSample,
  findMatchingFewShot,
  loadAiKnowledgeBase,
  normalizeVietnamese
} from './aiKnowledgeBase.js';
import { type RedFlagCheck, checkRedFlags } from './redFlagService.js';
import type { CreateSuggestionsInput } from './suggestionService.js';

type GeminiParsedResponse = {
  intent?: unknown;
  sensitivity?: unknown;
  flag_reason?: unknown;
  analysis?: unknown;
  replies?: unknown;
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const fallbackTones = [
  'Tình cảm & Đồng cảm sâu sắc',
  'Chuyên môn kỹ thuật & Sư phạm',
  'Rõ ràng theo Quy định & Policy',
  'Ngắn gọn, súc tích',
  'Khích lệ & Tạo động lực'
];

const assignmentKeywords = ['clip', 'video', 'bai tap', 'bài tập', 'ngon', 'ngón', 'phim', 'phím', 'rotation'];

export async function createGeminiSuggestions(input: CreateSuggestionsInput): Promise<SuggestionResult> {
  const knowledgeBase = await loadAiKnowledgeBase();
  const latestStudentText = getLatestStudentText(input.messages);
  const transcript = buildTranscript(input.messages);
  const redFlagCheck = checkRedFlags(`${latestStudentText}\n${transcript}`, knowledgeBase.redFlags);

  if (!latestStudentText.trim() && !transcript.trim()) {
    throw new Error('Không có nội dung hội thoại để tạo gợi ý.');
  }

  if (!config.ai.geminiApiKey || config.ai.geminiApiKey === 'demo') {
    const fallback = createFewShotFallback(
      input,
      knowledgeBase.fewShots,
      latestStudentText || transcript,
      redFlagCheck,
      'Thiếu Gemini API key.'
    );
    if (fallback) return fallback;
    throw new Error('Gemini API key chưa được cấu hình.');
  }

  try {
    const parsedResult = await requestGemini({
      latestStudentText,
      transcript,
      persona: knowledgeBase.persona,
      policy: knowledgeBase.policy,
      redFlagsRaw: knowledgeBase.redFlagsRaw
    });

    return normalizeGeminiResult(input, parsedResult, latestStudentText, redFlagCheck);
  } catch (error) {
    const fallback = createFewShotFallback(
      input,
      knowledgeBase.fewShots,
      latestStudentText || transcript,
      redFlagCheck,
      `Gemini chưa trả về được kết quả hợp lệ: ${getErrorMessage(error)}`
    );

    if (fallback) return fallback;
    throw error;
  }
}

async function requestGemini(input: {
  latestStudentText: string;
  transcript: string;
  persona: string;
  policy: string;
  redFlagsRaw: string;
}) {
  const systemInstructionText = `
Bạn là AI Trợ Lý của "Thầy Minh Piano" - giảng viên dạy đàn Piano.
Nhiệm vụ của bạn là phân tích lịch sử hội thoại của học viên, phân loại ngữ cảnh, phân loại mức độ nhạy cảm (ĐỎ / VÀNG / XANH), và sinh ra ĐÚNG 3 PHƯƠNG ÁN TRẢ LỜI để nhân viên chọn/sửa trước khi gửi.

=== HỒ SƠ PHONG CÁCH (PERSONA) ===
${input.persona}

=== QUY ĐỊNH & CHÍNH SÁCH (POLICY - SỐ LIỆU CỨNG, KHÔNG TỰ BỊA) ===
${input.policy}

=== BỘ TỪ KHÓA CỜ ĐỎ & NGUYÊN TẮC AN TOÀN ===
${input.redFlagsRaw}

=== NGUYÊN TẮC BẮT BUỘC ===
1. Phân loại intent:
   - "check_in": hỏi thăm, động viên, lâu không tương tác, nhắc tập nhẹ nhàng.
   - "assignment_feedback": học viên gửi bài/clip/video hoặc hỏi lỗi kỹ thuật đàn.
   - "sensitive": bệnh nặng, khủng hoảng tâm lý, tang sự, tài chính nghiêm trọng, khiếu nại nhạy cảm.
2. Phân loại sensitivity:
   - "do": ca nhạy cảm cao. Không níu kéo, không thúc ép bài vở. Ưu tiên an ủi, tôn trọng quyết định, người thật phải duyệt.
   - "vang": cần chú ý, hỏi bài, bảo lưu, chính sách thông thường, có nguy cơ nghỉ.
   - "xanh": trao đổi học tập thường quy.
3. Giọng điệu của Thầy Minh:
   - Thân thiện, gần gũi, tự nhiên miền Nam: "nè", "ha", "nhen", "hengg", "á", "kk", emoji vừa phải.
   - Xưng hô chuẩn mực theo ngữ cảnh hội thoại.
   - Khi nhận xét kỹ thuật đàn: nói cụ thể lỗi và bài tập sửa, không nói chung chung.
4. Trả đúng JSON, không markdown, không giải thích ngoài JSON.
`.trim();

  const userPrompt = `
TIN NHẮN HỌC VIÊN GẦN NHẤT:
"${input.latestStudentText || '[Không có tin nhắn học viên riêng biệt]'}"

LỊCH SỬ HỘI THOẠI GẦN NHẤT:
${input.transcript || '[Không có lịch sử hội thoại]'}
`.trim();

  const geminiRequestBody = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          intent: {
            type: 'STRING',
            enum: ['check_in', 'assignment_feedback', 'sensitive'],
            description: 'Use case chính của hội thoại.'
          },
          sensitivity: {
            type: 'STRING',
            enum: ['xanh', 'vang', 'do'],
            description: 'Phân loại mức độ nhạy cảm.'
          },
          flag_reason: {
            type: 'STRING',
            description: 'Lý do phân loại độ nhạy cảm.'
          },
          analysis: {
            type: 'STRING',
            description: 'Phân tích ngắn gọn tình huống và tâm lý học viên.'
          },
          replies: {
            type: 'ARRAY',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'OBJECT',
              properties: {
                tone: {
                  type: 'STRING',
                  description: 'Tên góc tiếp cận của câu trả lời.'
                },
                content: {
                  type: 'STRING',
                  description: 'Nội dung phản hồi hoàn chỉnh chuẩn giọng Thầy Minh.'
                }
              },
              required: ['tone', 'content']
            }
          }
        },
        required: ['intent', 'sensitivity', 'flag_reason', 'analysis', 'replies']
      },
      temperature: 0.7
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.geminiModel}:generateContent?key=${config.ai.geminiApiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(geminiRequestBody),
    signal: AbortSignal.timeout(25_000)
  });

  if (!response.ok) {
    throw new Error(await getGeminiErrorMessage(response));
  }

  const geminiData = (await response.json()) as GeminiApiResponse;
  const rawText = geminiData.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;

  if (!rawText) {
    throw new Error('Không nhận được phản hồi hợp lệ từ Gemini API.');
  }

  return parseGeminiJson(rawText);
}

function normalizeGeminiResult(
  input: CreateSuggestionsInput,
  parsedResult: GeminiParsedResponse,
  latestStudentText: string,
  redFlagCheck: RedFlagCheck
): SuggestionResult {
  const replies = normalizeReplies(parsedResult.replies).slice(0, 3);

  if (!replies.length) {
    throw new Error('Gemini không trả về danh sách gợi ý hợp lệ.');
  }

  const baseSensitivity = coerceSensitivity(parsedResult.sensitivity);
  const sensitivity = redFlagCheck.isRed ? 'do' : baseSensitivity;
  const intent = redFlagCheck.isRed
    ? 'sensitive'
    : coerceIntent(parsedResult.intent, sensitivity, latestStudentText);
  const flagReason =
    typeof parsedResult.flag_reason === 'string' ? parsedResult.flag_reason : 'AI đã phân loại hội thoại.';

  return {
    intent,
    sensitivity,
    flagReason: redFlagCheck.isRed
      ? `[Lớp bảo vệ cờ đỏ kích hoạt]: ${redFlagCheck.reason} (Gốc AI: ${flagReason})`
      : flagReason,
    analysis: typeof parsedResult.analysis === 'string' ? parsedResult.analysis : undefined,
    provider: 'gemini',
    redFlagTriggered: redFlagCheck.isRed,
    suggestions: replies.map((reply, index) => ({
      id: `sug-${input.conversationId}-ai-${index + 1}`,
      tone: reply.tone,
      content: reply.content
    }))
  };
}

function createFewShotFallback(
  input: CreateSuggestionsInput,
  samples: FewShotSample[],
  text: string,
  redFlagCheck: RedFlagCheck,
  reason: string
): SuggestionResult | null {
  const matchedSample = findMatchingFewShot(samples, text);
  if (!matchedSample) return null;

  const replies = normalizeReplies(matchedSample.model_replies).slice(0, 3);
  if (!replies.length) return null;

  const sensitivity = redFlagCheck.isRed ? 'do' : coerceSensitivity(matchedSample.sensitivity || matchedSample.category);

  return {
    intent: redFlagCheck.isRed ? 'sensitive' : coerceIntent(undefined, sensitivity, text),
    sensitivity,
    flagReason: redFlagCheck.isRed ? redFlagCheck.reason : matchedSample.flag_reason || 'Mẫu dữ liệu thực tế.',
    analysis: `[Fallback dữ liệu mẫu]: ${reason}`,
    provider: 'few-shot',
    isDemoFallback: true,
    redFlagTriggered: redFlagCheck.isRed,
    suggestions: replies.map((reply, index) => ({
      id: `sug-${input.conversationId}-sample-${index + 1}`,
      tone: reply.tone || fallbackTones[index] || `Góc nhìn ${index + 1}`,
      content: reply.content
    }))
  };
}

function normalizeReplies(replies: unknown) {
  if (!Array.isArray(replies)) return [];

  return replies
    .map((reply, index) => {
      if (typeof reply === 'string') {
        return {
          tone: fallbackTones[index] || `Góc nhìn ${index + 1}`,
          content: reply.trim()
        };
      }

      if (reply && typeof reply === 'object') {
        const item = reply as { tone?: unknown; content?: unknown };
        return {
          tone: typeof item.tone === 'string' ? item.tone : fallbackTones[index] || `Góc nhìn ${index + 1}`,
          content: typeof item.content === 'string' ? item.content.trim() : ''
        };
      }

      return {
        tone: fallbackTones[index] || `Góc nhìn ${index + 1}`,
        content: ''
      };
    })
    .filter((reply) => reply.content);
}

function getLatestStudentText(messages: Array<Pick<ChatMessage, 'sender' | 'text'>>) {
  return [...messages].reverse().find((message) => message.sender === 'student' && message.text.trim())?.text ?? '';
}

function buildTranscript(messages: CreateSuggestionsInput['messages']) {
  return messages
    .slice(-30)
    .filter((message) => message.text.trim())
    .map((message) => {
      const senderLabel =
        message.sender === 'student' ? 'Học viên' : message.sender === 'staff' ? 'Nhân viên/Thầy' : 'Hệ thống';
      return `[${message.createdAt}] ${senderLabel}: ${message.text}`;
    })
    .join('\n');
}

function coerceSensitivity(value: unknown): 'xanh' | 'vang' | 'do' {
  if (value === 'do' || value === 'vang' || value === 'xanh') return value;
  return 'xanh';
}

function coerceIntent(value: unknown, sensitivity: 'xanh' | 'vang' | 'do', text: string): SuggestionIntent {
  if (value === 'check_in' || value === 'assignment_feedback' || value === 'sensitive') return value;
  if (sensitivity === 'do') return 'sensitive';

  const normalizedText = normalizeVietnamese(text);
  if (assignmentKeywords.some((keyword) => normalizedText.includes(normalizeVietnamese(keyword)))) {
    return 'assignment_feedback';
  }

  return normalizedText ? 'check_in' : 'unknown';
}

async function getGeminiErrorMessage(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return `Gemini API lỗi: ${parsed.error.message}`;
  } catch {
    // Use the generic status message below.
  }

  return `Gemini API lỗi (${response.status}): ${response.statusText}`;
}

function parseGeminiJson(rawText: string): GeminiParsedResponse {
  try {
    return JSON.parse(rawText) as GeminiParsedResponse;
  } catch {
    const jsonLikeText = rawText.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonLikeText) throw new Error('Lỗi định dạng JSON từ Gemini API.');
    return JSON.parse(jsonLikeText) as GeminiParsedResponse;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi không xác định';
}
