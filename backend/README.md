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

### Pancake (single-page)

- `PANCAKE_PAGE_ID`: page id dang dung.
- `PANCAKE_PAGE_ACCESS_TOKEN`: page token (Settings -> Tools). Dung cho conversations/messages — **khong** generate tu user access token.
- User Pancake access token chi dung luc `POST /api/auth/login`, khong luu lau dai.

### Auth (phase 2)

1. Client goi `POST /api/auth/login` body `{ "accessToken": "<pancake user token>" }`.
2. Backend goi Pancake `GET /v1/pages?access_token=...`, tim page `PANCAKE_PAGE_ID`.
3. Doc `uid` tu JWT accessToken; `uid` phai nam trong `active_user_ids` cua page do.
4. Tra `sessionToken` (JWT ky bang `APP_SESSION_SECRET`) `{ userId, pageId }`.
5. Staff API gan `Authorization: Bearer <sessionToken>`.

Loi thuong gap:

- Sai page / khong thay page → `403`
- `uid` ngoai `active_user_ids` → `403` `USER_NOT_ACTIVE`
- Thieu Bearer → `401` `AUTH_REQUIRED`

`GET /api/health` van public. `POST /api/auth/login` public.

Bien tuy chon (mac dinh tat):

- `ENABLE_ENV_ACTIVE_USER_FALLBACK=1` + `PANCAKE_ACTIVE_USER_IDS` — dung CSV env khi page khong co `active_user_ids`.
- `ALLOW_DEV_USER_HEADER=1` — cho phep phase-1 `X-User-Id` (chi khi id nam trong CSV env).

### AI

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.6-flash
AI_KNOWLEDGE_DIR=../data
```

### CORS (E1 extension / Vite)

Backend cho phep Origin: `chrome-extension://*`, Vite widget `http://127.0.0.1:5174`, FE `5173`.
Packed widget can goi `http://127.0.0.1:4000` (set `VITE_API_BASE_URL` khi build).
Them origin: `CORS_ORIGINS=https://example.com`.

## Scripts

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm start
```

## Endpoints

- `GET /api/health` (public)
- `POST /api/auth/login` (public) — body `{ accessToken }`
- `GET /api/pages` (Bearer session)
- `GET /api/conversations` (Bearer session)
- `GET /api/conversations/:conversationId/messages` (Bearer session)
- `POST /api/suggestions` (Bearer session)
- `GET|POST /api/demo-replies` (Bearer session)

## QA checklist

- `pnpm typecheck` / `pnpm build` pass.
- Health khong can auth.
- Login acc ∈ `active_user_ids` cua `PANCAKE_PAGE_ID` → `sessionToken`.
- Login acc ngoai list / sai page → `403`.
- Staff API voi Bearer hop le → OK; thieu/invalid → `401`.
- Conversations van dung `PANCAKE_PAGE_ACCESS_TOKEN` only.
