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

## UC-03 — Grading phrasings (W2)

- Teacher free-text note → **Soạn cách nói** → 3 mock phrasings (gần gũi / rõ ràng / động viên).
- Empty note → soft “tiếp nhận bài, chưa nhận xét chuyên môn” card.
- Facts come only from the note (no invented technique). Phrases authored Thầy/Em then pronoun-rewritten.
- **Copy** / **Dùng câu này** feed `activeDraft` for Footer **Đổ vào ô soạn**. Score UI removed.

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
