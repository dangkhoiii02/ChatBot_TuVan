# Task plan: Demo BE TypeScript cho Pancake read-only

Muc tieu phase nay la xay mot backend demo bang Node.js + TypeScript de lay du lieu hoi thoai tu Pancake, dua cho React UI hien thi, va goi AI core sinh goi y. Backend demo chi doc du lieu tu Pancake. Tuyet doi chua gui tin nhan ve Pancake trong phase nay.

## Pham vi demo

Co lam:

- Lay danh sach hoi thoai tu Pancake bang GET API.
- Lay lich su tin nhan cua mot hoi thoai bang GET API.
- Normalize du lieu Pancake ve format on dinh cho frontend.
- Goi AI suggestion service bang lich su hoi thoai da lay.
- Luu phan hoi demo vao local file JSONL de test workflow.
- Ho tro frontend auto refresh bang cach goi GET dinh ky.

Khong lam:

- Khong POST tin nhan ve Pancake.
- Khong mark read/unread tren Pancake.
- Khong assign, tag, update conversation tren Pancake.
- Khong reverse-engineer realtime socket cua Pancake.
- Khong luu lau dai raw message hoc vien ngoai muc can thiet cho demo.
- Khong expose `page_access_token` ra frontend.

## Cong nghe

- Node.js 20+
- TypeScript
- Express
- Native `fetch` cua Node.js
- dotenv
- zod cho validate env/input
- pnpm lam package manager

Ly do dung TypeScript:

- De normalize raw Pancake response thanh contract ro rang.
- De frontend va backend co the share mental model ve type.
- De sau nay tach thanh extension/backend production de hon.

## Cau truc thu muc muc tieu

```txt
ChatBot_TuVan/
  backend/
    package.json
    tsconfig.json
    .env.example
    README.md
    data/
      demo_replies.jsonl
    src/
      server.ts
      app.ts
      config.ts
      types/
        api.ts
        pancake.ts
      routes/
        health.routes.ts
        conversations.routes.ts
        suggestions.routes.ts
        demoReplies.routes.ts
      services/
        pancakeClient.ts
        pancakeNormalizer.ts
        suggestionService.ts
        demoReplyStore.ts
      utils/
        asyncHandler.ts
        httpError.ts
```

## Lenh pnpm can co trong README

```bash
cd ChatBot_TuVan/backend
pnpm install
pnpm dev
pnpm build
pnpm start
```

Scripts trong `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit"
  }
}
```

## Bien moi truong

File `backend/.env.example`:

```env
PORT=4000
NODE_ENV=development

PANCAKE_BASE_URL=https://pages.fm/api
PANCAKE_PAGE_ID=
PANCAKE_PAGE_ACCESS_TOKEN=
PANCAKE_CONVERSATION_LIMIT=30
PANCAKE_MESSAGE_LIMIT=30

AI_PROVIDER=mock
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

DEMO_REPLY_STORE_PATH=./data/demo_replies.jsonl
```

Nguyen tac:

- `PANCAKE_PAGE_ACCESS_TOKEN` chi doc o backend.
- Neu thieu token/page id, backend van co the chay health check, nhung route Pancake tra loi loi cau hinh ro rang.
- Khong commit `.env`.

## Internal API cho frontend

### `GET /api/health`

Kiem tra backend song va cau hinh co san sang hay chua.

Response:

```json
{
  "ok": true,
  "service": "pancake-demo-backend",
  "pancakeConfigured": true,
  "aiProvider": "mock"
}
```

### `GET /api/conversations`

Lay danh sach hoi thoai gan nhat.

Query optional:

- `limit`: mac dinh tu env, toi da 50.
- `since`: ISO date, optional.
- `until`: ISO date, optional.

Luu y Pancake:

- Khoang `since`/`until` khong nen vuot qua 1 thang.
- V1 demo chi lay cua so gan nhat. Neu can history dai hon thi phase sau moi chia nho khoang thoi gian.

Response:

```json
{
  "items": [
    {
      "id": "conv_123",
      "customerId": "cus_456",
      "customerName": "Nguyen An",
      "avatarUrl": "",
      "lastMessage": "Em gui thay clip bai tap...",
      "updatedAt": "2026-09-14T07:00:00.000Z",
      "unreadCount": 2,
      "source": "pancake"
    }
  ]
}
```

### `GET /api/conversations/:conversationId/messages`

Lay message gan nhat cua mot hoi thoai.

Query optional:

- `limit`: mac dinh tu env, toi da 50.
- `before`: cursor/time neu Pancake ho tro.

Response:

```json
{
  "conversationId": "conv_123",
  "items": [
    {
      "id": "msg_1",
      "conversationId": "conv_123",
      "sender": "student",
      "senderName": "Nguyen An",
      "text": "Em gui thay clip bai tap...",
      "attachments": [],
      "createdAt": "2026-09-14T07:00:00.000Z"
    }
  ]
}
```

### `POST /api/suggestions`

Sinh goi y tu lich su hoi thoai. Endpoint nay khong goi Pancake.

Request:

```json
{
  "conversationId": "conv_123",
  "messages": [
    {
      "id": "msg_1",
      "sender": "student",
      "text": "Em gui thay clip bai tap...",
      "createdAt": "2026-09-14T07:00:00.000Z"
    }
  ]
}
```

Response:

```json
{
  "intent": "assignment_feedback",
  "sensitivity": "vang",
  "suggestions": [
    {
      "id": "sug_1",
      "tone": "Am ap",
      "content": "Thay xem clip roi ne..."
    }
  ]
}
```

### `GET /api/demo-replies`

Doc lich su phan hoi demo da luu local.

Query optional:

- `conversationId`

Response:

```json
{
  "items": [
    {
      "id": "reply_123",
      "conversationId": "conv_123",
      "content": "Noi dung nhan vien da sua...",
      "sourceSuggestionId": "sug_1",
      "createdAt": "2026-09-14T07:10:00.000Z"
    }
  ]
}
```

### `POST /api/demo-replies`

Luu phan hoi demo vao local JSONL. Endpoint nay khong goi Pancake.

Request:

```json
{
  "conversationId": "conv_123",
  "content": "Noi dung nhan vien da sua...",
  "sourceSuggestionId": "sug_1"
}
```

Response:

```json
{
  "ok": true,
  "item": {
    "id": "reply_123",
    "conversationId": "conv_123",
    "content": "Noi dung nhan vien da sua...",
    "sourceSuggestionId": "sug_1",
    "createdAt": "2026-09-14T07:10:00.000Z"
  }
}
```

## Type contract noi bo

`src/types/api.ts`:

```ts
export type ConversationSummary = {
  id: string;
  customerId?: string;
  customerName: string;
  avatarUrl?: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
  source: 'pancake';
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  sender: 'student' | 'staff' | 'system';
  senderName?: string;
  text: string;
  attachments: MessageAttachment[];
  createdAt: string;
};

export type MessageAttachment = {
  type: 'image' | 'video' | 'audio' | 'file' | 'unknown';
  url?: string;
  name?: string;
};

export type SuggestionIntent = 'check_in' | 'assignment_feedback' | 'sensitive' | 'unknown';

export type SuggestionResult = {
  intent: SuggestionIntent;
  sensitivity: 'xanh' | 'vang' | 'do';
  suggestions: Array<{
    id: string;
    tone: string;
    content: string;
  }>;
};
```

## Pancake client read-only

`pancakeClient.ts` can co cac ham:

```ts
listConversations(input: {
  limit: number;
  since?: string;
  until?: string;
}): Promise<unknown>

listMessages(input: {
  conversationId: string;
  limit: number;
  before?: string;
}): Promise<unknown>
```

Nguyen tac:

- Moi request den Pancake tu backend deu them `page_access_token`.
- Timeout request nen co gioi han, vi UI demo khong duoc treo lau.
- Neu Pancake tra loi loi, backend tra loi error co message ngan gon cho frontend.
- Khong log token.
- Khong log raw message day du trong production mode.

## Normalizer

`pancakeNormalizer.ts` can co:

```ts
normalizeConversation(raw: unknown): ConversationSummary
normalizeMessage(raw: unknown, conversationId: string): ChatMessage
```

Muc tieu:

- Cach ly frontend khoi raw shape cua Pancake.
- Neu raw field thieu, dung fallback an toan.
- Convert sender thanh `student`, `staff`, hoac `system`.
- Attachment chi lay metadata can hien thi, khong tai file ve server.

## Suggestion service

`suggestionService.ts` co 2 mode:

- `mock`: sinh 2-3 goi y dua theo message gan nhat va keyword don gian.
- `real`: phase sau noi vao AI core hien co.

Phase dau chi can mock service:

- Neu message co tu khoa clip/video/bai tap: intent `assignment_feedback`.
- Neu message co tu khoa benh/nang/khung hoang: sensitivity `do`, intent `sensitive`.
- Con lai: intent `check_in`.

Sau nay endpoint nay co the noi Claude/Gemini ma frontend khong doi.

## Demo reply store

`demoReplyStore.ts`:

- Append tung reply vao JSONL.
- Doc danh sach reply gan nhat.
- Filter theo `conversationId`.
- Tao file neu chua co.

Khong luu raw Pancake message vao file nay. Chi luu:

- `id`
- `conversationId`
- `content`
- `sourceSuggestionId`
- `createdAt`

## Polling strategy cho demo

Backend khong can worker polling nen trong phase nay.

Frontend se goi:

- `GET /api/conversations` moi 30-60 giay.
- `GET /api/conversations/:conversationId/messages` moi 30-60 giay khi conversation dang mo.

Day la auto refresh, khong goi la realtime.

Ly do chua realtime:

- Chua co webhook/socket chinh thuc tu Pancake trong pham vi demo.
- Khong nen reverse-engineer socket noi bo cua Pancake vi de vo khi ho update.
- Extension production sau nay co the lay context truc tiep trong Pancake UI, nhung demo backend hien tai nen giu sach va on dinh.

## Task chia cho agent

### Agent 1: Scaffold backend TypeScript

Pham vi file:

- `ChatBot_TuVan/backend/package.json`
- `ChatBot_TuVan/backend/tsconfig.json`
- `ChatBot_TuVan/backend/src/server.ts`
- `ChatBot_TuVan/backend/src/app.ts`
- `ChatBot_TuVan/backend/src/routes/health.routes.ts`
- `ChatBot_TuVan/backend/.env.example`

Yeu cau:

- Dung Express + TypeScript.
- Dung pnpm.
- Co scripts `dev`, `build`, `start`, `typecheck`.
- `GET /api/health` hoat dong.

Acceptance criteria:

- `pnpm install` cai dependency.
- `pnpm typecheck` pass.
- `pnpm build` pass.
- `pnpm dev` chay backend o port env hoac 4000.

### Agent 2: Config va validation

Pham vi file:

- `ChatBot_TuVan/backend/src/config.ts`
- Co the sua `health.routes.ts` de expose status cau hinh.

Yeu cau:

- Doc `.env` bang dotenv.
- Validate config bang zod.
- Khong fail server startup neu thieu Pancake token, nhung route Pancake phai bao loi cau hinh ro.
- Co default hop ly cho limit.

Acceptance criteria:

- Health response co `pancakeConfigured`.
- Khong in token ra log.

### Agent 3: Pancake client read-only

Pham vi file:

- `ChatBot_TuVan/backend/src/services/pancakeClient.ts`
- `ChatBot_TuVan/backend/src/types/pancake.ts`

Yeu cau:

- Implement `listConversations`.
- Implement `listMessages`.
- Chi dung GET.
- Build URL tu `PANCAKE_BASE_URL`, `PANCAKE_PAGE_ID`, `PANCAKE_PAGE_ACCESS_TOKEN`.
- Xu ly HTTP error va timeout.

Acceptance criteria:

- Khong co ham send/post message.
- Token khong xuat hien trong error/log.
- Neu chua config token, throw error noi bo co message de route map thanh 503.

### Agent 4: Normalizer

Pham vi file:

- `ChatBot_TuVan/backend/src/types/api.ts`
- `ChatBot_TuVan/backend/src/services/pancakeNormalizer.ts`

Yeu cau:

- Tao type contract cho frontend.
- Map raw conversation ve `ConversationSummary`.
- Map raw message ve `ChatMessage`.
- Handle field thieu bang fallback.

Acceptance criteria:

- Frontend khong can doc raw Pancake response.
- Attachment duoc normalize ve type/image/video/audio/file/unknown.

### Agent 5: Conversation routes

Pham vi file:

- `ChatBot_TuVan/backend/src/routes/conversations.routes.ts`
- Co the sua `app.ts` de mount route.

Yeu cau:

- `GET /api/conversations`
- `GET /api/conversations/:conversationId/messages`
- Validate query `limit`, `since`, `until`, `before`.
- Clamp limit toi da 50.
- Response dung contract noi bo.

Acceptance criteria:

- Route tra JSON on dinh.
- Loi Pancake/config duoc tra ve message ngan gon.
- Khong expose raw token.

### Agent 6: Suggestion service va route

Pham vi file:

- `ChatBot_TuVan/backend/src/services/suggestionService.ts`
- `ChatBot_TuVan/backend/src/routes/suggestions.routes.ts`
- Co the sua `app.ts` de mount route.

Yeu cau:

- `POST /api/suggestions`.
- Phase dau AI_PROVIDER=mock.
- Input la conversationId + messages.
- Output 2-3 suggestions.
- Detect co ban 3 intent:
  - `check_in`
  - `assignment_feedback`
  - `sensitive`

Acceptance criteria:

- Khong goi Pancake.
- Tra suggestion co tone va content.
- Tin nhay cam tra sensitivity `do`.

### Agent 7: Demo reply store

Pham vi file:

- `ChatBot_TuVan/backend/src/services/demoReplyStore.ts`
- `ChatBot_TuVan/backend/src/routes/demoReplies.routes.ts`
- `ChatBot_TuVan/backend/data/demo_replies.jsonl`
- Co the sua `app.ts` de mount route.

Yeu cau:

- `GET /api/demo-replies`
- `POST /api/demo-replies`
- Luu local JSONL.
- Tao data dir/file neu chua co.
- Khong gui ve Pancake.

Acceptance criteria:

- POST demo reply append duoc file.
- GET doc lai duoc.
- Filter theo conversationId neu co.

### Agent 8: README va QA

Pham vi file:

- `ChatBot_TuVan/backend/README.md`

Yeu cau README:

- Ghi ro backend demo chi read-only voi Pancake.
- Huong dan:
  - copy `.env.example` thanh `.env`;
  - dien Pancake page id/token;
  - `pnpm install`;
  - `pnpm dev`;
  - `pnpm build`;
  - `pnpm typecheck`.
- Liet ke endpoints.
- Liet ke checklist test.

Acceptance criteria:

- Nguoi khac doc README chay duoc backend demo.
- Co canh bao ro: khong gui tin ve Pancake trong phase nay.

## Thu tu giao viec de tranh conflict

1. Agent 1 scaffold.
2. Agent 2 config.
3. Agent 3 va Agent 4 lam sau khi co config/type khung.
4. Agent 5 mount route conversation.
5. Agent 6 lam suggestion mock.
6. Agent 7 lam demo reply store.
7. Agent 8 viet README va checklist sau cung.

Neu muon gop it agent hon:

- Agent A: scaffold + config.
- Agent B: Pancake client + normalizer + conversation routes.
- Agent C: suggestion mock + demo reply store.
- Agent D: README + QA.

## Checklist QA cuoi phase

- `pnpm install` chay thanh cong.
- `pnpm typecheck` pass.
- `pnpm build` pass.
- `GET /api/health` tra ok.
- Khi thieu token, `GET /api/conversations` tra loi cau hinh thieu, khong crash.
- Khi co token, lay duoc conversations.
- Chon conversation lay duoc messages.
- `POST /api/suggestions` tra 2-3 goi y.
- `POST /api/demo-replies` luu local, khong co request POST nao den Pancake.
- Khong co token trong response/log.
