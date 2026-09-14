# ChatBot Tư Vấn - Thầy Minh Piano

Demo AI copilot hỗ trợ nhân viên trung tâm nhạc xem hội thoại Pancake, lấy lịch sử chat read-only, sinh gợi ý phản hồi bằng AI và lưu câu trả lời demo ở local.

## Trạng thái hiện tại

MVP hiện có hai phần chính:

- `backend/`: Node.js + TypeScript + Express. Lấy page/conversation/message từ Pancake, sinh gợi ý bằng mock hoặc Gemini, lưu reply demo vào local JSONL.
- `frontend/`: React + Vite. UI 3 cột gồm danh sách hội thoại, khung chat và panel gợi ý AI.
- `server.js` + `public/`: demo HTML cũ/legacy, giữ lại để tham khảo AI core và dữ liệu mẫu.

Backend hiện chỉ đọc dữ liệu Pancake. Nút gửi demo không gửi tin nhắn về Pancake.

## Cấu trúc thư mục

```txt
ChatBot_TuVan/
├── backend/                 # API demo mới
├── frontend/                # UI React demo mới
├── data/                    # persona, policy, red flags, few-shot
├── public/                  # UI HTML demo cũ
├── server.js                # server demo cũ
├── DEMO_BE_TASKS.md         # task BE đã lập kế hoạch
├── DEMO_UI_TASKS.md         # task UI đã lập kế hoạch
└── ke-hoach-xay-dung-bot-thay-minh.md
```

## Yêu cầu

- Node.js 20+
- pnpm

## Chạy backend

```bash
cd backend
pnpm install
cp .env.example .env
pnpm dev
```

Backend mặc định chạy ở:

```txt
http://localhost:4000
```

Các biến env chính:

```bash
PANCAKE_ACCESS_TOKEN=
PANCAKE_PAGE_ID=
PANCAKE_PAGE_ACCESS_TOKEN=

AI_PROVIDER=mock
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
AI_KNOWLEDGE_DIR=../data
```

Ghi chú:

- `PANCAKE_ACCESS_TOKEN` dùng để list các page và generate `page_access_token` theo từng page.
- `PANCAKE_PAGE_ID` là optional, chỉ dùng làm page mặc định khi mở UI.
- `AI_PROVIDER=gemini` để bật Gemini thật. Nếu lỗi AI, backend fallback về mock/few-shot để demo không chết luồng.

## Chạy frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend mặc định chạy ở:

```txt
http://localhost:5173
```

Vite proxy `/api` về backend `http://localhost:4000`.

## API chính

```txt
GET  /api/health
GET  /api/pages
GET  /api/conversations?pageIds=PAGE_ID_1,PAGE_ID_2&limit=30
GET  /api/conversations/:conversationId/messages?pageId=PAGE_ID
POST /api/suggestions
GET  /api/demo-replies
POST /api/demo-replies
```

## Luồng demo

1. Frontend gọi `/api/pages`.
2. Nhân viên chọn một hoặc nhiều page.
3. Frontend gọi `/api/conversations?pageIds=...`.
4. Khi chọn hội thoại, frontend gọi message theo đúng `pageId`.
5. Nhân viên bấm tạo gợi ý AI.
6. Nhân viên copy hoặc gửi demo. Gửi demo chỉ lưu local, không gọi API gửi tin về Pancake.

## Kiểm tra nhanh

```bash
pnpm --dir backend typecheck
pnpm --dir backend build
pnpm --dir frontend build
```

## Lưu ý bảo mật

- Không commit `.env`.
- Không commit token/API key.
- Không commit `node_modules`, `dist`, hoặc runtime data JSONL.
- Dữ liệu hội thoại học viên là dữ liệu nhạy cảm, chỉ dùng trong phạm vi demo nội bộ.
