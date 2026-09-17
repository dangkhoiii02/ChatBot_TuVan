# Trợ lý học viên — Thầy Minh Piano

Ứng dụng hỗ trợ nhân viên đọc hội thoại Pancake và tạo gợi ý trả lời. Nhân viên duyệt nội dung trước khi sử dụng. AI hỗ trợ nhiều nhà cung cấp, không gắn cứng Gemini.

## Cấu trúc

- `backend/`: Express + TypeScript, xác thực Pancake, API hội thoại/gợi ý, lưu dữ liệu SQLite.
- `frontend/`: giao diện React chính, chạy mặc định cổng 5180.
- `widget/`: giao diện React nhúng trong extension, chạy dev cổng 5174.
- `extension/`: Chrome Manifest V3, đọc ngữ cảnh Pancake và điền bản nháp; bản widget đóng gói ở `extension/widget/`.
- `server.js` + `public/`: demo độc lập cũ, mặc định cổng 3000, không có hệ thống xác thực của backend mới; chỉ dùng local.
- `shared/ai-provider.cjs`: định tuyến và gọi API dùng chung cho hai backend.
- `data/`: persona, chính sách, bộ cờ đỏ và mẫu hội thoại.

## Chạy dự án

Yêu cầu Node.js **22.13 trở lên** (`node:sqlite`) và npm hoặc pnpm. Không ghi đè `.env` đang có.

```bash
cd backend
npm install
# Chỉ khi chưa có .env:
cp .env.example .env
npm run dev
```

Mở terminal khác:

```bash
cd frontend
npm install
npm run dev
```

Truy cập `http://localhost:5180`. Chế độ demo dùng token `demo` ở môi trường development. Khi kết nối thật, cấu hình `PANCAKE_PAGE_ID`, `PANCAKE_PAGE_ACCESS_TOKEN`, `APP_SESSION_SECRET` trong `backend/.env`, rồi đăng nhập bằng Pancake user access token. Production không chấp nhận token demo; lỗi xác thực không tự chuyển thành đăng nhập demo.

## API key, nhà cung cấp và model

Trong màn hình đăng nhập hoặc **Cấu hình AI**, chọn nhà cung cấp, nhập API key và mã model chính xác. Widget cũng có mục **Cấu hình AI** riêng. Cấu hình được lưu trong localStorage của từng origin; web, widget và extension không tự chia sẻ key. Key cũ `gemini_api_key` được chuyển sang `ai_api_key` khi mở giao diện.

| Lựa chọn | Giao thức |
| --- | --- |
| Gemini | Google `generateContent` |
| Anthropic Claude | Anthropic Messages |
| OpenAI, DeepSeek, Groq, OpenRouter, Mistral, xAI | Chat Completions |
| Khác / custom | Endpoint tương thích OpenAI Chat Completions |
| Dữ liệu mẫu | Không gọi API ngoài |

Không giới hạn danh sách model trong giao diện và không tự đổi model người dùng nhập. Hỗ trợ model **chat văn bản** tương thích các giao thức trên; model ảnh, âm thanh, embedding, hoặc API riêng khác cần adapter riêng. Tài khoản phải có quyền dùng model và hạn mức hợp lệ. Nội dung đính kèm chưa được gửi cho AI như ảnh/video.

**Một API key có thể dùng nhiều model**, không thể suy ra model duy nhất từ key. Chế độ tự nhận diện dùng tiền tố key rõ ràng hoặc tên model; nếu không rõ sẽ yêu cầu chọn nhà cung cấp. Hệ thống không thử gửi cùng key sang nhiều nhà cung cấp.

Key được gửi trong body tới backend, sau đó chỉ gửi tới endpoint đã chọn qua header xác thực. Backend không ghi key vào bảng lịch sử generation. Không sử dụng tính năng lưu key trên trình duyệt dùng chung nếu không muốn người khác truy cập cấu hình.

### Cấu hình máy chủ

Nếu client để trống cấu hình, backend đọc:

```dotenv
AI_PROVIDER=openai
AI_API_KEY=<api-key>
AI_MODEL=<model-id-duoc-cap-quyen>
```

Các lựa chọn provider: `auto`, `mock`, `openai`, `gemini`, `anthropic` (alias `claude`), `deepseek`, `groq`, `openrouter`, `mistral`, `xai`, `custom`. Biến `GEMINI_API_KEY`, `GEMINI_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` được hỗ trợ để tương thích; dùng `AI_MODEL` cho model ngoài Gemini. Cấu hình client không mượn key/model máy chủ khi nhập thiếu.

Với gateway riêng:

```dotenv
AI_PROVIDER=custom
AI_API_KEY=<api-key>
AI_MODEL=<model-id>
AI_BASE_URL=https://gateway.example/v1
AI_ALLOWED_BASE_URLS=https://gateway.example/v1
```

Base URL là tiền tố trước `/chat/completions`, phải dùng HTTPS và nằm trong danh sách quản trị viên cho phép. Không chấp nhận redirect, tài khoản hoặc query trong URL. Khi triển khai, giữ thư mục `shared/` cạnh `backend/` vì cả source và bản build dùng module chung này.

Nếu AI lỗi, backend mới trả dữ liệu dự phòng kèm `isDemoFallback` và lý do. Luồng cờ đỏ dùng bộ quy tắc cục bộ, không cần gọi AI. Demo cũ trả lỗi API trực tiếp khi có key nhưng gọi thất bại.

## Widget và extension

```bash
cd widget
npm install
npm run build
cd ..
bash extension/scripts/sync-widget-dist.sh
```

Bản đóng gói cần `VITE_API_BASE_URL=http://127.0.0.1:4000` hoặc URL backend triển khai. Trong Chrome mở trang quản lý tiện ích, bật Developer mode, chọn **Load unpacked** và chọn thư mục `extension/`. Khi cập nhật bản đóng gói, bấm Reload extension. Không chạy `npm install/build` trong `extension/` vì đây không phải package Node.

## Kiểm thử

Từ thư mục gốc:

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run build --prefix widget
node --test tests/*.test.cjs
```

Các kiểm thử dùng API giả lập, không tiêu thụ hạn mức AI: định tuyến, payload/header từng giao thức, lỗi JSON/HTTP, cô lập key, allowlist endpoint, xác thực và CORS. Kiểm thử HTTP mở cổng localhost tạm thời. Kết nối thực tế với từng nhà cung cấp cần key và model hợp lệ của người dùng.

Tham chiếu giao thức: [Gemini](https://ai.google.dev/api/generate-content), [Claude](https://platform.claude.com/docs/en/api/overview), [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat/create).
