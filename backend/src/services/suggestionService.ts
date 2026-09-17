import { resolveAI } from '../../../shared/ai-provider.cjs';
import { randomUUID } from 'node:crypto';
import type { ChatMessage, SuggestionIntent, SuggestionResult } from '../types/api.js';
import { createAISuggestions } from './aiSuggestionProvider.js';
import { loadAiKnowledgeBase, normalizeVietnamese } from './aiKnowledgeBase.js';
import { checkRedFlags } from './redFlagService.js';
import { getDatabase } from '../db/index.js';

export type CreateSuggestionsInput = {
  conversationId: string;
  messages: Array<Pick<ChatMessage, 'sender' | 'text' | 'createdAt'>>;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

const assignmentKeywords = [
  'clip',
  'video',
  'bai tap',
  'bài tập',
  'ngon',
  'ngón',
  'phim',
  'phím',
  'rotation',
  'o nhip',
  'ô nhịp',
  'vap',
  'vấp',
  'gong',
  'gồng'
];

export async function createSuggestions(input: CreateSuggestionsInput): Promise<SuggestionResult> {
  const startTime = Date.now();
  const knowledgeBase = await loadAiKnowledgeBase();

  const studentMessages = input.messages.filter((m) => m.sender === 'student');
  const latestStudentText = studentMessages[studentMessages.length - 1]?.text || '';
  const fullTranscript = input.messages.map((m) => `${m.sender}: ${m.text}`).join('\n');

  // 1. Independent Multi-category Red Flag Safety Guard
  const redFlagCheck = checkRedFlags(`${latestStudentText}\n${fullTranscript}`, knowledgeBase.redFlags);

  let result: SuggestionResult;
  const settings = resolveAI(input);
  const hasAIKey = settings.provider !== 'mock';

  if (redFlagCheck.isRed) {
    result = createRedFlagSuggestions(input.conversationId, redFlagCheck);
  } else if (hasAIKey) {
    try {
      result = await createAISuggestions({ ...input, ...settings });
    } catch (error) {
      console.warn('AI suggestion failed, fallback to local knowledge engine:', error);
      result = {
        ...createSmartKnowledgeSuggestions(input, latestStudentText, knowledgeBase),
        provider: 'mock',
        isDemoFallback: true,
        analysis: `AI chưa trả về được kết quả, hệ thống dùng bộ gợi ý từ Knowledge Base chuẩn Thầy Minh. Chi tiết: ${getErrorMessage(error)}`
      };
    }
  } else {
    // High-fidelity knowledge engine
    result = {
      ...createSmartKnowledgeSuggestions(input, latestStudentText, knowledgeBase),
      provider: 'mock',
      isDemoFallback: true
    };
  }

  // 2. Audit Trail Persistence to SQLite
  const latencyMs = Date.now() - startTime;
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO generations (
        id, conversation_id, input_text, context_json, model, sensitivity, flag_reason, replies_json, latency_ms, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `gen-${randomUUID()}`,
      input.conversationId,
      latestStudentText,
      JSON.stringify({ messageCount: input.messages.length }),
      result.provider || 'mock',
      result.sensitivity,
      result.flagReason || null,
      JSON.stringify(result.suggestions),
      latencyMs,
      new Date().toISOString()
    );
  } catch (err) {
    console.warn('Could not record generation audit to SQLite:', err);
  }

  return result;
}

function createRedFlagSuggestions(
  conversationId: string,
  redFlagCheck: { category: string; keyword: string; instruction: string; reason: string }
): SuggestionResult {
  return {
    intent: 'sensitive',
    sensitivity: 'do',
    redFlagTriggered: true,
    provider: 'safety-rules',
    flagReason: redFlagCheck.reason,
    analysis: `CỜ ĐỎ [${redFlagCheck.category}]: Phát hiện từ khóa "${redFlagCheck.keyword}". ${redFlagCheck.instruction}`,
    suggestions: [
      {
        id: `sug-${conversationId}-rf-1`,
        tone: 'Đồng cảm sâu sắc & Hỗ trợ chính sách',
        content:
          'Dạ em chào mình ạ! Em nghe tin mà bàng hoàng và thương mình quá. Chuyện học đàn và bài vở mình đừng bận tâm chút nào nữa hết nha. Sức khỏe và tinh thần lúc này là ưu tiên số một. Về khóa học, em sẽ trao đổi với bộ phận phụ trách để kiểm tra phương án hỗ trợ phù hợp. Mình cứ yên tâm điều trị và dưỡng sức nhé. Chúc mình vạn sự bình an ạ! ❤️'
      },
      {
        id: `sug-${conversationId}-rf-2`,
        tone: 'Rõ việc cần làm & Tôn trọng tối đa',
        content:
          'Sức khỏe và sự an yên của mình là điều quan trọng nhất lúc này ạ. Nếu mình muốn, em có thể chuyển đề nghị hỗ trợ đến bộ phận phụ trách để kiểm tra và xác nhận với mình nhé. Chúc mình kiên cường và sớm bình phục!'
      },
      {
        id: `sug-${conversationId}-rf-3`,
        tone: 'Ngắn gọn & Chân thành',
        content:
          'Em xin gửi lời chia sẻ chân thành nhất đến mình và gia đình. Việc học mình cứ gác lại hoàn toàn nhé. Lớp học luôn sẵn sàng đồng hành khi nào sức khỏe và cuộc sống của mình đã hoàn toàn ổn định trở lại ạ.'
      }
    ]
  };
}

function createSmartKnowledgeSuggestions(
  input: CreateSuggestionsInput,
  latestStudentText: string,
  knowledgeBase: Awaited<ReturnType<typeof loadAiKnowledgeBase>>
): SuggestionResult {
  const normalizedText = normalizeVietnamese(latestStudentText);

  // Check assignment feedback
  const isAssignment = assignmentKeywords.some((kw) => normalizedText.includes(kw));

  if (isAssignment) {
    return {
      intent: 'assignment_feedback',
      sensitivity: 'vang',
      flagReason: 'Ngữ cảnh chấm bài và hướng dẫn kỹ thuật phím đàn.',
      suggestions: [
        {
          id: `sug-${input.conversationId}-1`,
          tone: 'Sư phạm & Kỹ thuật',
          content:
            'Thầy xem clip rồi nè em! Bắt bệnh ngay chỗ chuyển ngón: ngón tay bị gồng do cổ tay hạ hơi thấp khi luồn phím. Em thả lỏng cổ tay, dùng lực xoay nhẹ (rotation) từ cẳng tay chứ đừng gồng ngón ấn xuống nha. Em tập riêng đoạn này 10 lần với tempo chậm 50 thôi, tay sẽ lướt êm ngay á!'
        },
        {
          id: `sug-${input.conversationId}-2`,
          tone: 'Thân mật & Khích lệ',
          content:
            'Tiếng đàn tuần này của em sáng và đều hơn hẳn rồi nè! Chỉ cần chú ý thả lỏng cổ tay thêm một chút ở đoạn phím đen nữa là tuyệt vời luôn. Em cứ tập chậm lại từng ô nhịp nhen, cố lên sắp thành thạo bài rồi nè 🥰'
        },
        {
          id: `sug-${input.conversationId}-3`,
          tone: 'Rõ việc cần làm',
          content:
            'Em tập trung sửa kỹ thuật rotation ở đoạn vấp nhé. Giữ vai và cổ tay thật thả lỏng, tập lặp lại đoạn ngắn 5-7 phút mỗi ngày là thông tay liền nè!'
        }
      ]
    };
  }

  // Check-in / Retention
  return {
    intent: 'check_in',
    sensitivity: 'xanh',
    flagReason: 'Hội thoại hỏi thăm tiến độ và khích lệ thói quen tập đàn.',
    suggestions: [
      {
        id: `sug-${input.conversationId}-1`,
        tone: 'Thân mật & Khích lệ',
        content:
          'Thầy hiểu mà em ơi! Cuộc sống người đi làm/đi học nhiều khi có những giai đoạn công việc nó chiếm hết thời gian quý báu của mình. Em đừng tự tạo áp lực nhen! Nếu hôm nào về nhà mà lỡ dư ra được 10-15 phút rảnh thì em chỉ cần lướt ngón nhẹ nhàng thôi (có tập 15p vẫn hơn là không tập kk 🥰). Khi nào bận quá cứ nhắn thầy hỗ trợ nha!'
      },
      {
        id: `sug-${input.conversationId}-2`,
        tone: 'Rõ việc cần làm & Chính sách bảo lưu',
        content:
          'Dạ không sao đâu em ơi! Đừng lo quên bài, cơ bắp ngón tay có trí nhớ tốt lắm, khi quay lại chỉ cần 2 hôm là quen ngay. Nếu đợt này bận kéo dài trên 1 tuần, em báo thầy để thầy lưu ý kích hoạt chính sách bảo lưu khóa học cho em an tâm nhen!'
      },
      {
        id: `sug-${input.conversationId}-3`,
        tone: 'Nhẹ nhàng & Động viên',
        content:
          'Công việc và sức khỏe là ưu tiên hàng đầu, em nhớ giữ gìn sức khỏe nhen! Đàn piano là để giải tỏa căng thẳng chứ không phải gánh nặng đâu nè. Mỗi tối chỉ cần 10-15 phút thư giãn bên phím đàn là đủ vui rồi em ha!'
      }
    ]
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
