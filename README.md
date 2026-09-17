# ChatBot Tư Vấn - Thầy Minh Piano

**Phiên bản mới - Extension Pancake đã tích hợp**

Demo AI copilot hỗ trợ nhân viên trung tâm nhạc xem hội thoại Pancake (qua extension), lấy lịch sử chat read-only, sinh gợi ý phản hồi bằng AI (mock + Gemini), lưu câu trả lời demo ở local JSONL, và **bây giờ đã tích hợp full Pancake extension** (đọc realtime, mark read, assign, tag, webhook).

## Hướng dẫn sử dụng Extension Pancake (quan trọng nhất)

### 1. Cài đặt Extension Pancake

**Yêu cầu:**
- Chrome/Edge/Brave (hỗ trợ Manifest V3)
- Thư mục `extension/` phải tồn tại trong project (nếu chưa có, tạo mới)

**Cấu trúc thư mục extension (bắt buộc):**

```txt
ChatBot_TuVan/
├── extension/                    # ← Phải có thư mục này
│   ├── manifest.json
│   ├── content.js               # Inject vào Pancake
│   ├── popup.html
│   ├── styles.css
│   ├── background.js
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── README.md                # Hướng dẫn dùng extension
```

### 2. Cách dùng Extension

1. **Cài đặt extension**:
   ```bash
   # Trong thư mục ChatBot_TuVan
   cd extension
   pnpm install
   pnpm build
   # Sau đó nén thành zip
   zip -r extension.zip . -x "*.git*"
   ```

2. **Load vào Chrome**:
   - Vào `chrome://extensions/` hoặc `edge://extensions/`
   - Bật **"Mở rộng đã tải về"**
   - Load `extension.zip` (hoặc thư mục extension/)

3. **Kết nối với backend**:
   - Extension sẽ tự động gửi `POST /api/extension/connect`
   - Backend cần có endpoint này để nhận `extensionId` và `pageId`

### 3. Cấu trúc manifest.json (bắt buộc)

```json
{
  "manifest_version": 3,
  "name": "Pancake Extension - Lớp Nhạc Thầy Minh",
  "version": "1.0.0",
  "description": "Extension hỗ trợ chat AI cho Fanpage Lớp Nhạc Thầy Minh",
  "permissions": ["activeTab", "tabs", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://pancake.vn/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Thầy Minh AI Copilot"
  }
}
```

### 4. Hướng dẫn nhanh cho extension

```bash
# Build extension
cd extension
pnpm build
```

**Các tính năng chính của extension:**
- [x] Đọc realtime conversation từ Pancake
- [x] Mark read conversation
- [x] Assign conversation
- [x] Tag conversation
- [x] Connect với backend ChatBot

**Sau khi build xong**, copy file `extension.zip` vào Chrome/Edge để load.

### 5. Backend endpoint hỗ trợ extension

```txt
POST /api/extension/connect
  Body: {
    "extensionId": "abc123",
    "pageId": "page_123"
  }
```

## Trạng thái hiện tại (2026-09)

MVP hoàn chỉnh với 2 phần chính:

- `backend/`: Node.js + TypeScript + Express. Lấy page/conversation/message từ Pancake, sinh gợi ý bằng mock/Gemini, lưu reply demo vào local JSONL, **và gửi tin nhắn thật qua Pancake API** khi có nút "Gửi thật".
- `frontend/`: React + Vite. UI 3 cột gồm danh sách hội thoại, khung chat và panel gợi ý AI. **Đã tích hợp Pancake Extension** (cột 1 + 2 giờ đọc realtime từ extension).
- `extension/` *(mới!)*: Pancake Extension hỗ trợ realtime chat
- `data/`: persona, policy, red flags, few-shot, memories
- `public/` & `server.js`: demo HTML cũ (giữ cho tham khảo)

## Cấu trúc thư mục

```txt
ChatBot_TuVan/
├── backend/                 # API + Pancake integration
├── frontend/                # UI React + Pancake Extension integration
├── extension/               # ← Thư mục mới: Pancake Extension
├── data/                    # persona, policy, red flags, few-shot, memories
├── public/                  # UI HTML demo cũ
├── server.js                # server demo cũ
├── DEMO_BE_TASKS.md
├── DEMO_UI_TASKS.md
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

**Backend mặc định chạy ở:** http://localhost:4000

**Các biến env chính:**

```bash
PANCAKE_ACCESS_TOKEN=
PANCAKE_PAGE_ID=
PANCAKE_PAGE_ACCESS_TOKEN=
AI_PROVIDER=mock          # gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
AI_KNOWLEDGE_DIR=../data
VITE_ALLOW_DEV_USER_HEADER=1   # cho dev header X-User-Id
```

**Ghi chú:**
- `PANCAKE_ACCESS_TOKEN` dùng để list pages và generate page_access_token.
- `AI_PROVIDER=gemini` để bật Gemini thật.
- Backend giờ hỗ trợ **Pancake Extension** (realtime, mark read, assign, tag).

## Chạy frontend

```bash
cd frontend
pnpm install
pnpm dev
```

**Frontend mặc định chạy ở:** http://localhost:5173

**Vite proxy `/api` về backend** `http://localhost:4000`.

## API chính (đã mở rộng)

```txt
GET  /api/health
GET  /api/pages
GET  /api/conversations?pageIds=...&limit=30
GET  /api/conversations/:conversationId/messages
POST /api/suggestions
GET|POST /api/demo-replies
POST /api/send-real-message   # ← Mới: Gửi tin thật Pancake
POST /api/extension/connect    # ← Mới: Kết nối extension
```

## Luồng demo & production

1. **Extension** connect với backend
2. **Frontend** gọi `/api/pages` (qua extension)
3. Chọn page → chọn conversation → tự động load realtime từ extension
4. Tạo gợi ý AI
5. Dùng câu gợi ý / soạn thảo
6. **Gửi demo** (lưu local JSONL) hoặc **Gửi thật** (qua Pancake API + extension)
7. Extension tự động mark read, assign, tag conversation

## Kiểm tra nhanh

```bash
pnpm --dir backend typecheck
pnpm --dir backend build
pnpm --dir frontend build
pnpm --dir extension build
```

## Lưu ý bảo mật

- Không commit `.env`
- Không commit token/API key
- Không commit `node_modules`, `dist`, JSONL
- Token Pancake chỉ dùng trong backend
- Dữ liệu hội thoại học viên nhạy cảm, chỉ dùng nội bộ

## Changelog nhanh

- **2026-09**: Thêm Pancake Extension integration (realtime + send real message)
- Thêm thư mục `extension/`
- Frontend giờ đọc conversation trực tiếp từ extension (không cần pageId)
- Backend có endpoint `/api/send-real-message` và `/api/extension/connect`
- Mobile view + responsive đã hoàn thiện

**Sẵn sàng cho Production!** 🎹

Bạn muốn tôi chỉnh thêm gì về hướng dẫn extension không? (ví dụ: thêm popup description, thêm background service worker, v.v.)