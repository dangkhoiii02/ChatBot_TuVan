// Mock Provider for testing and offline development
async function generateMockReply({ message, context = {}, knowledge = {}, model = 'mock-model' }) {
  const startTime = Date.now();

  // Check if red flags were triggered
  if (knowledge.redFlagCheck && knowledge.redFlagCheck.isRed) {
    return {
      sensitivity: 'do',
      flag_reason: knowledge.redFlagCheck.reason,
      analysis: 'Phát hiện tín hiệu nhạy cảm theo quy tắc an toàn. Chuyển sang mẫu phản hồi khẩn cấp/an ủi.',
      replies: [
        {
          tone: 'An ủi & Ưu tiên sức khỏe (Ca đỏ)',
          content: knowledge.redFlagCheck.safeReplyTemplate
        }
      ],
      token_usage: { prompt_tokens: 150, completion_tokens: 80, total_tokens: 230 },
      latency_ms: Date.now() - startTime,
      provider: 'mock'
    };
  }

  // Determine sensitivity
  const isYellow = message.toLowerCase().includes('bảo lưu') || 
                   message.toLowerCase().includes('lỗi ngón') || 
                   message.toLowerCase().includes('phím');
  const sensitivity = isYellow ? 'vang' : 'xanh';

  const tones = [
    'Tình cảm & Đồng cảm sâu sắc',
    'Kỹ thuật & Sư phạm chuẩn',
    'Rõ ràng theo Quy định & Policy',
    'Ngắn gọn, súc tích',
    'Khích lệ & Tạo động lực'
  ];

  const replies = tones.map((tone, idx) => {
    let content = `Chào bạn nè ^^! Về nội dung: "${message.slice(0, 50)}...", thầy Minh xin chia sẻ theo góc nhìn [${tone}]: `;
    if (idx === 0) content += 'Em cứ giữ tâm thế thoải mái, âm nhạc là để kết nối và giải tỏa nhen!';
    else if (idx === 1) content += 'Em chú ý thả lỏng cổ tay và chuyển ngón nhịp nhàng theo bài tập 15 phút mỗi ngày nhé.';
    else if (idx === 2) content += 'Theo chính sách khóa 20 tuần, em có tối đa 90 ngày bảo lưu nếu cần việc bận nha.';
    else if (idx === 3) content += 'Cứ tập đều tay 15p là tiến bộ thấy rõ á!';
    else content += 'Cố lên heng, từng phím đàn là một niềm vui nhỏ mỗi ngày đó!';

    return { tone, content };
  });

  return {
    sensitivity,
    flag_reason: isYellow ? 'Nội dung liên quan kỹ thuật hoặc quy định học vụ' : 'Tin nhắn giao lưu thông thường',
    analysis: 'Mô phỏng phân tích tâm lý học viên (Mock Provider).',
    replies,
    token_usage: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500 },
    latency_ms: Date.now() - startTime,
    provider: 'mock'
  };
}

module.exports = {
  generateMockReply
};
