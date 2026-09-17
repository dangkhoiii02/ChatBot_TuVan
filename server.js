const { resolveAI, requestAI } = require('./shared/ai-provider.cjs');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Hàm đọc dữ liệu file
function readDataFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

// Hàm lưu dữ liệu file
function writeDataFile(filename, content) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
}

// Đọc danh mục cờ đỏ
function getRedFlagsConfig() {
  try {
    const raw = readDataFile('red_flags.json');
    return JSON.parse(raw);
  } catch (e) {
    return { categories: {} };
  }
}

// Bộ lọc từ khóa cờ đỏ (Lớp bảo vệ độc lập)
function checkRedFlags(text) {
  if (!text) return { isRed: false };
  const lower = text.toLowerCase();
  const config = getRedFlagsConfig();
  
  for (const [catKey, cat] of Object.entries(config.categories || {})) {
    for (const kw of cat.keywords || []) {
      if (lower.includes(kw.toLowerCase())) {
        return {
          isRed: true,
          category: cat.name,
          keyword: kw,
          instruction: cat.instruction,
          reason: `Phát hiện từ khóa nhạy cảm cờ đỏ [${kw}] thuộc nhóm "${cat.name}". Cần ưu tiên an ủi, tôn trọng quyết định, BẮT BUỘC người thật duyệt.`
        };
      }
    }
  }
  return { isRed: false };
}

// Xử lý MIME type cho file tĩnh
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

// Đọc JSON từ Request Body
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // Giới hạn 5MB
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Trả về JSON Response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-gemini-api-key'
  });
  res.end(JSON.stringify(data));
}

// Phục vụ Static Files
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Bảo vệ không cho duyệt ra ngoài public dir
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

// Khởi tạo HTTP Server
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;
  const method = req.method;

  // Xử lý CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-gemini-api-key'
    });
    return res.end();
  }

  try {
    // 1. API Lấy danh sách và nội dung tài liệu nạp cho AI
    if (pathname === '/api/documents' && method === 'GET') {
      const docNames = ['persona.md', 'policy.md', 'red_flags.json', 'few_shots.json', 'raw_messages.txt'];
      const docs = {};
      for (const name of docNames) {
        docs[name] = readDataFile(name);
      }
      return sendJSON(res, 200, { success: true, documents: docs });
    }

    // 2. API Lưu/Nạp cập nhật tài liệu
    if (pathname === '/api/documents' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { filename, content } = body;
      
      const allowedFiles = ['persona.md', 'policy.md', 'red_flags.json', 'few_shots.json', 'raw_messages.txt'];
      if (!allowedFiles.includes(filename)) {
        return sendJSON(res, 400, { success: false, error: 'Tên file không hợp lệ.' });
      }
      
      writeDataFile(filename, content || '');
      return sendJSON(res, 200, { success: true, message: `Đã cập nhật ${filename} thành công!` });
    }

    // 3. API Lấy mẫu tin nhắn demo có sẵn
    if (pathname === '/api/samples' && method === 'GET') {
      try {
        const samples = JSON.parse(readDataFile('few_shots.json') || '[]');
        return sendJSON(res, 200, { success: true, samples });
      } catch (e) {
        return sendJSON(res, 200, { success: true, samples: [] });
      }
    }

    // 4. API Lịch sử & Lưu phản hồi đã duyệt
    if (pathname === '/api/history' && method === 'GET') {
      const historyFile = path.join(DATA_DIR, 'history.jsonl');
      if (!fs.existsSync(historyFile)) {
        return sendJSON(res, 200, { success: true, history: [] });
      }
      const lines = fs.readFileSync(historyFile, 'utf-8').trim().split('\n').filter(Boolean);
      const history = lines.map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      }).filter(Boolean).reverse();
      return sendJSON(res, 200, { success: true, history });
    }

    if (pathname === '/api/history' && method === 'POST') {
      const body = await parseRequestBody(req);
      const historyFile = path.join(DATA_DIR, 'history.jsonl');
      const record = {
        id: 'hist_' + Date.now(),
        timestamp: new Date().toISOString(),
        ...body
      };
      fs.appendFileSync(historyFile, JSON.stringify(record) + '\n', 'utf-8');
      return sendJSON(res, 200, { success: true, message: 'Đã lưu phản hồi vào lịch sử duyệt!' });
    }

    // 5. API Phân loại và Sinh 5 phương án trả lời bằng Gemini
    if (pathname === '/api/generate' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { message = '', context = {} } = body;
      let settings;
      try {
        settings = resolveAI({ ...body, apiKey: body.apiKey ?? req.headers['x-gemini-api-key'] });
      } catch (error) { return sendJSON(res, 400, { success: false, error: error.message }); }
      const { apiKey, model } = settings;

      if (!message.trim()) {
        return sendJSON(res, 400, { success: false, error: 'Tin nhắn học viên không được để trống.' });
      }

      // Bước 1: Chạy bộ lọc từ khóa cờ đỏ độc lập
      const redFlagCheck = checkRedFlags(message);

      // Đọc tài liệu nạp vào AI
      const personaContent = readDataFile('persona.md');
      const policyContent = readDataFile('policy.md');
      const redFlagsContent = readDataFile('red_flags.json');
      const fewShotsRaw = readDataFile('few_shots.json');

      let fewShots = [];
      try {
        fewShots = JSON.parse(fewShotsRaw || '[]');
      } catch (e) {}

      // Nếu không có API Key, kiểm tra xem có khớp mẫu demo có sẵn không
      if (!apiKey || apiKey === 'demo') {
        const trimmedMsg = message.trim().toLowerCase();
        const matchedSample = fewShots.find(s => 
          trimmedMsg.includes(s.input_message.toLowerCase().slice(0, 30)) ||
          s.input_message.toLowerCase().includes(trimmedMsg.slice(0, 30))
        );

        if (matchedSample) {
          const tones = [
            'Tình cảm & Đồng cảm sâu sắc',
            'Chuyên môn kỹ thuật & Sư phạm',
            'Rõ ràng theo Quy định & Policy',
            'Ngắn gọn, súc tích',
            'Khích lệ & Tạo động lực'
          ];
          const replies = (matchedSample.model_replies || []).slice(0, 5).map((content, idx) => ({
            tone: tones[idx] || `Góc nhìn ${idx + 1}`,
            content: content
          }));

          return sendJSON(res, 200, {
            success: true,
            isDemoFallback: true,
            data: {
              sensitivity: redFlagCheck.isRed ? 'do' : matchedSample.sensitivity,
              flag_reason: redFlagCheck.isRed ? redFlagCheck.reason : (matchedSample.flag_reason || 'Mẫu dữ liệu thực tế'),
              analysis: `[Chế độ Demo Dữ Liệu Thật]: Tin nhắn được đối chiếu với cơ sở dữ liệu mẫu từ Thầy Minh Piano. Nhập AI API Key ở góc trên để AI tự động sinh câu trả lời mới theo thời gian thực!`,
              replies: replies
            },
            redFlagTriggered: redFlagCheck.isRed
          });
        }

        return sendJSON(res, 400, {
          success: false,
          error: 'Chưa cung cấp AI API Key! Vui lòng dán AI API Key ở góc trên giao diện để AI phân tích tin nhắn này (hoặc bấm chọn các nút Mẫu tin nhắn thử nghiệm ở trên).'
        });
      }

      // Chuẩn bị System Instruction
      const systemInstructionText = `
Bạn là AI Trợ Lý của "Thầy Minh Piano" - giảng viên dạy đàn Piano.
Nhiệm vụ của bạn là phân tích tin nhắn của học viên, phân loại mức độ nhạy cảm (ĐỎ / VÀNG / XANH), và sinh ra ĐÚNG 5 PHƯƠNG ÁN TRẢ LỜI tối ưu nhất để Thầy Minh hoặc nhân viên chọn/sửa trước khi gửi.

=== HỒ SƠ PHONG CÁCH (PERSONA) ===
${personaContent}

=== QUY ĐỊNH & CHÍNH SÁCH (POLICY - SỐ LIỆU CỨNG, KHÔNG TỰ BỊA) ===
${policyContent}

=== BỘ TỪ KHÓA CỜ ĐỎ & NGUYÊN TẮC AN TOÀN ===
${redFlagsContent}

=== NGUYÊN TẮC BẮT BUỘC:
1. Phân loại mức độ nhạy cảm:
   - "do" (ĐỎ): Khi học viên nhắc đến bệnh nan y/nguy kịch (ung thư, nằm viện, cấp cứu...), khủng hoảng tâm lý/tự hại, tang sự người thân, vỡ nợ nghiêm trọng. NGUYÊN TẮC: TUYỆT ĐỐI KHÔNG DÙNG KỸ THUẬT NÍU KÉO HOẶC THÚC ÉP BÀI VỞ. Chỉ an ủi chân thành, tôn trọng quyết định tạm ngưng/hủy khóa, sẵn sàng hoàn tiền theo đúng chính sách trong Policy (hoàn 2tr800 cho khóa mới).
   - "vang" (VÀNG): Hỏi bài tập, chữa lỗi ngón/rotation/video, xin bảo lưu bình thường, thắc mắc lịch học/chính sách thông thường.
   - "xanh" (XANH): Chào hỏi, cảm ơn, hỏi thăm tiến độ thông thường, nhắc nhở tập đàn 15 phút, vui tươi.
2. Giọng điệu của Thầy Minh:
   - Thân thiện, gần gũi, dùng từ ngữ tự nhiên miền Nam: "nè", "ha", "nhen", "hengg", "á", "kk", emoji 🥰, ^^, :)).
   - Xưng hô chuẩn mực theo ngữ cảnh được cung cấp (thầy - em hoặc thầy - chị).
   - Khi nhận xét kỹ thuật đàn: chính xác từng giây, bắt đúng bệnh (vướng phím đen, rotation, chuyển ngón, xếp ngón 4-5...), chỉ bài tập lặp lại cụ thể.
3. Sinh ĐÚNG 5 phương án trả lời khác nhau về góc tiếp cận:
   - Phương án 1: Tình cảm & Đồng cảm sâu sắc
   - Phương án 2: Chuyên môn kỹ thuật & Sư phạm chuẩn
   - Phương án 3: Rõ ràng, vững vàng theo quy định và chính sách
   - Phương án 4: Ngắn gọn, súc tích, đi thẳng vào trọng tâm
   - Phương án 5: Khích lệ, tạo động lực & năng lượng tích cực
`.trim();

      // Tạo ngữ cảnh chi tiết học viên
      let studentContextPrompt = `NỘI DUNG TIN NHẮN CỦA HỌC VIÊN:\n"${message}"\n`;
      if (context && Object.keys(context).length > 0) {
        studentContextPrompt += `\nTHÔNG TIN NGỮ CẢNH HỌC VIÊN:\n`;
        if (context.audience) studentContextPrompt += `- Đối tượng: ${context.audience}\n`;
        if (context.pronoun) studentContextPrompt += `- Xưng hô mong muốn: ${context.pronoun}\n`;
        if (context.old_issue) studentContextPrompt += `- Bệnh cũ: ${context.old_issue}\n`;
        if (context.old_prescription) studentContextPrompt += `- Chỉ định cũ: ${context.old_prescription}\n`;
        if (context.current_issue) studentContextPrompt += `- Bệnh hiện tại: ${context.current_issue}\n`;
        if (context.current_prescription) studentContextPrompt += `- Chỉ định hiện tại: ${context.current_prescription}\n`;
        if (context.appointment_days) studentContextPrompt += `- Số ngày hẹn: ${context.appointment_days}\n`;
      }

      let parsedResult;
      try {
        parsedResult = await requestAI(settings, systemInstructionText, studentContextPrompt);
      } catch (error) {
        return sendJSON(res, 502, { success: false, error: error.message });
      }

      // LỚP BẢO VỆ 2: Nếu bộ lọc từ khóa độc lập phát hiện cờ đỏ, luôn ép về CỜ ĐỎ
      if (redFlagCheck.isRed) {
        parsedResult.sensitivity = 'do';
        parsedResult.flag_reason = `[Lớp bảo vệ cờ đỏ kích hoạt]: ${redFlagCheck.reason} (Gốc AI: ${parsedResult.flag_reason || 'none'})`;
      }

      return sendJSON(res, 200, {
        success: true,
        data: parsedResult,
        provider: `${settings.provider} (${settings.model})`,
        redFlagTriggered: redFlagCheck.isRed
      });
    }

    // Mặc định: Phục vụ Web Frontend
    if (method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    sendJSON(res, 404, { success: false, error: 'Not found' });
  } catch (error) {
    console.error('Server error:', error);
    sendJSON(res, 500, { success: false, error: error.message || 'Lỗi hệ thống' });
  }
});

if (require.main === module) server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Bot Trợ Lý Thầy Minh Piano đang chạy trên cổng ${PORT}`);
  console.log(`  Truy cập giao diện: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

module.exports = { server };
