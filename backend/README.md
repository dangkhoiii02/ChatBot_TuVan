# Pancake Demo Backend

Backend demo nay dung Node.js + TypeScript de lay hoi thoai tu Pancake o che do read-only, sinh goi y bang dữ liệu mẫu hoặc AI đa nhà cung cấp, va luu phan hoi demo vao local JSONL.

Trong phase nay backend khong gui tin nhan ve Pancake, khong mark read, khong assign, va khong tag hoi thoai.

## Chay local

```bash
cd ChatBot_TuVan/backend
pnpm install
cp .env.example .env
pnpm dev
```

### UI với dữ liệu giả, không cần tài khoản Pancake

```bash
cd backend
npm run dev:fixtures-ui
```

Mở `http://127.0.0.1:5180/`. Lệnh này dựng SQLite tạm, tạo signed session giả cho `staff-test`/`page-test`, rồi chạy Backend và Vite. Auth/page authorization của Backend vẫn hoạt động; chế độ này chỉ có trong Vite dev và dừng lệnh sẽ xóa DB tạm. Production build vẫn hiện form đăng nhập.

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
GEMINI_MODEL=<model-id-duoc-cap-quyen>
AI_KNOWLEDGE_DIR=../data
```

### CORS (E1 extension / Vite)

Backend cho phep Origin: `chrome-extension://*`, Vite widget `http://127.0.0.1:5174`, FE `5173` hoặc `5180`.
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

Trong chế độ chấm bài, client gửi `contextRevision` để phát hiện hồ sơ đã đổi. Chọn bài đang tập bằng `assignmentId`; nhập `assignmentTitle` sẽ tạo bài mới kể cả khi có bài khác trùng tên. `reviewSessionKey` giữ một lượt trả bài duy nhất khi thử lại cùng yêu cầu.

Khi đồng bộ tin, backend xếp hàng trích xuất AI nếu đã chọn học viên và cấu hình nhà cung cấp AI thật. Worker xử lý tối đa 20 tin mỗi lô, thử lại khi nhà cung cấp lỗi và chỉ tạo đề xuất chờ nhân viên duyệt. Nút đề xuất AI cho phép đọc lô chưa xử lý ngay; checkpoint theo thứ tự ghi vào SQLite nên tin cũ được backfill sau vẫn được xử lý. Chế độ AI `mock` không tự gọi nhà cung cấp.

## QA checklist

- `pnpm typecheck` / `pnpm build` pass.
- Health khong can auth.
- Login acc ∈ `active_user_ids` cua `PANCAKE_PAGE_ID` → `sessionToken`.
- Login acc ngoai list / sai page → `403`.
- Staff API voi Bearer hop le → OK; thieu/invalid → `401`.
- Conversations van dung `PANCAKE_PAGE_ACCESS_TOKEN` only.

## Isolated backend tests

Run `npm run build && npm test` from `backend/`. The adversarial integration suite sets `BACKEND_DATABASE_PATH` to a disposable SQLite file under the OS temp directory, seeds fixed fake IDs, signs a normal app session with a test-only secret, and removes the database in `finally`. It keeps the real auth middleware, authorization, ownership, services, and database writes in the request path. Pancake and AI HTTP responses are intercepted at `fetch`; no production credentials or stored development database are used. See [the adversarial test report](tests/ADVERSARIAL_TEST_REPORT.md) for covered cases and current results.

Cấu hình AI đa nhà cung cấp, giới hạn hỗ trợ và kiểm thử: xem [README gốc](../README.md). Node.js 22.13+ cần thiết cho `node:sqlite`. Demo login chỉ hoạt động ngoài production; lỗi Pancake không cấp phiên demo.
