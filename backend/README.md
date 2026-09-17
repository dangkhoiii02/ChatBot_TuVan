# Pancake Demo Backend

Backend demo nay dung Node.js + TypeScript de lay hoi thoai tu Pancake o che do read-only, sinh goi y bang mock/Gemini, va luu phan hoi demo vao local JSONL.

Trong phase nay backend khong gui tin nhan ve Pancake, khong mark read, khong assign, va khong tag hoi thoai.

## Chay local

```bash
cd ChatBot_TuVan/backend
pnpm install
cp .env.example .env
pnpm dev
```

Dien cau hinh Pancake (single-page):

- `PANCAKE_PAGE_ID`: page id dang dung.
- `PANCAKE_PAGE_ACCESS_TOKEN`: page token lay truc tiep tu Pancake Settings -> Tools. Backend **khong** generate token tu user `access_token` nua.
- `PANCAKE_ACTIVE_USER_IDS`: CSV UUID nhan vien duoc phep goi API. Moi request staff API can header `X-User-Id` nam trong list; thieu/ngoai list → `403` `USER_NOT_ACTIVE`.

`GET /api/health` van public (khong can `X-User-Id`).

`GET /api/pages` chi tra single-page tu `PANCAKE_PAGE_ID` (khong list nhieu page qua user token). Thieu `PANCAKE_PAGE_ID` → `501` `SINGLE_PAGE_MODE`.

De bat AI that, dat cac bien sau:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.6-flash
AI_KNOWLEDGE_DIR=../data
```

`AI_KNOWLEDGE_DIR` mac dinh tro ve bo tai lieu cu gom `persona.md`, `policy.md`, `red_flags.json`, va `few_shots.json`.

## Scripts

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm start
```

## Endpoints

- `GET /api/health` (public)
- `GET /api/pages` (can `X-User-Id`)
- `GET /api/conversations` (can `X-User-Id`)
- `GET /api/conversations/:conversationId/messages` (can `X-User-Id`)
- `POST /api/suggestions` (can `X-User-Id`)
- `GET /api/demo-replies` (can `X-User-Id`)
- `POST /api/demo-replies` (can `X-User-Id`)

## QA checklist

- `pnpm typecheck` pass.
- `pnpm build` pass.
- `GET /api/health` tra `ok: true` (khong can header user).
- Staff API thieu `X-User-Id` hoac id ngoai `PANCAKE_ACTIVE_USER_IDS` → `403` `USER_NOT_ACTIVE`.
- Khi thieu `PANCAKE_PAGE_ACCESS_TOKEN` / `PANCAKE_PAGE_ID`, route conversation tra loi cau hinh ro rang va server khong crash.
- `GET /api/pages` single-page khi co `PANCAKE_PAGE_ID`.
- `POST /api/suggestions` tra 2-3 goi y. Neu `AI_PROVIDER=gemini`, backend dung Gemini + persona/policy/red flags tu `../data`; neu AI loi thi fallback ve few-shot/mock de demo khong bi dung.
- `POST /api/demo-replies` chi append vao `data/demo_replies.jsonl`, khong goi Pancake.
