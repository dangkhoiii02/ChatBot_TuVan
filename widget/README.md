# Thầy Minh Piano — Copilot Widget (Dev 1)

React + TypeScript Vite mini-app (~360×560 sidebar panel) for Pancake staff.

## Dev

```bash
cd widget
npm install
npm run dev       # http://127.0.0.1:5174
```

Dev 2’s extension iframes `http://127.0.0.1:5174` by default.

## Build / typecheck

```bash
npm run typecheck
npm run build
```

## UC-02 — Pronoun quick change (W1)

- Suggestions store `baseText` (canonical Thầy/Em) and displayed `text`.
- Changing addresser/addressee via `PronounBar` (chips + Gọi/Xưng selects) rewrites `text` with `applyPronouns` — no AI regenerate.
- Default pair: Thầy - Em. Presets include Em-Chị, Thầy-Chị, Em-Anh, Thầy-Anh.
- Current pair shown on `StudentCard`; same control in Student tab.

## UC-03 — Chấm bài

- Nhận xét thô của giáo viên → **Soạn cách nói** → backend tạo ba cách diễn đạt.
- Không cho gửi nhận xét rỗng; lỗi API giữ nguyên nội dung giáo viên đã nhập.
- Nội dung chỉ dùng sự thật trong nhận xét và hội thoại, không tự bịa kỹ thuật hay tiến độ.
- **Copy** / **Dùng câu này** feed `activeDraft` for Footer **Đổ vào ô soạn**. Score UI removed.

## Production

- URL backend được đóng vào widget bằng `VITE_API_BASE_URL`; widget không cho nhập provider, API key hoặc model.
- Toàn bộ provider, API key và model được quản lý tại `backend/.env`.
- Backend phải cho phép ID extension qua `CORS_EXTENSION_IDS` và giữ `ALLOW_DEMO_MODE=0`.

## Bridge (for Dev 2)

Shared contract: `../shared/bridge.ts`

- Source constant: `thay-minh-copilot`
- On mount widget emits: `{ source, type: 'widget-ready' }`
- Host should reply: `{ source, type: 'bridge-ready', version: 1 }`
- Footer **Đổ vào ô soạn** emits: `{ source, type: 'fill-composer', text, requestId? }`
- Host may push: `{ source, type: 'conversation-context', conversationId, studentName?, pageId?, url? }`
- Optional: `{ source, type: 'widget-resize', height? }`

Vite alias: `@shared` → `../shared`.

Allow iframe embedding (CSP `frame-ancestors *` on dev/preview server).

## Legacy

Prototype `widget/index.html` + `widget/widget.js` (if present) belong in `widget/legacy/`.
