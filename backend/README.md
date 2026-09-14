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

Dien token Pancake neu muon goi Pancake that:

- `PANCAKE_ACCESS_TOKEN`: user access token. Backend dung token nay de list cac page va generate `page_access_token` theo tung page.
- `PANCAKE_PAGE_ID`: tuy chon. Neu co, backend se chon page nay lam default khi UI load lan dau.
- `PANCAKE_PAGE_ACCESS_TOKEN`: page token lay truc tiep tu Pancake Settings -> Tools. Chi phu hop cho single-page fallback, khong du de list nhieu page.

Neu hien tai ban dang co user `access_token`, hay dat vao `PANCAKE_ACCESS_TOKEN`. Endpoint generate page token cua Pancake co the refresh token page cu, nen production nen luu page token rieng sau khi da tao.

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

- `GET /api/health`
- `GET /api/pages`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId/messages`
- `POST /api/suggestions`
- `GET /api/demo-replies`
- `POST /api/demo-replies`

## QA checklist

- `pnpm typecheck` pass.
- `pnpm build` pass.
- `GET /api/health` tra `ok: true`.
- Khi thieu Pancake token, route conversation tra loi loi cau hinh ro rang va server khong crash.
- Khi co `PANCAKE_ACCESS_TOKEN`, `GET /api/pages` lay duoc danh sach page.
- Khi chon 1 hoac nhieu page, `GET /api/conversations?pageIds=...` lay duoc danh sach hoi thoai da gop.
- `POST /api/suggestions` tra 2-3 goi y. Neu `AI_PROVIDER=gemini`, backend dung Gemini + persona/policy/red flags tu `../data`; neu AI loi thi fallback ve few-shot/mock de demo khong bi dung.
- `POST /api/demo-replies` chi append vao `data/demo_replies.jsonl`, khong goi Pancake.
