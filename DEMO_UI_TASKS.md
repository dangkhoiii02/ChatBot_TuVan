# Task plan: Demo UI React cho chatbot goi y tin nhan

Muc tieu cua phase nay la dung mot demo UI bang React cho luong nhan vien trung tam nhac: chon hoc vien, doc hoi thoai, xem goi y AI, chon/sua/copy/gui demo. Chua ket noi Pancake that trong phase nay. Cac file HTML/CSS/JS hien tai trong `public/` chi xem la ban test cu.

## Nguyen tac chung cho tat ca agent

- Trinh bay plan va diff du kien truoc khi sua file.
- Chi sua dung pham vi task duoc giao.
- Khong dung lai `ChatBot_TuVan/public/index.html`, `ChatBot_TuVan/public/style.css`, `ChatBot_TuVan/public/app.js` cho UI moi.
- Khong dua token/API key vao frontend hoac mock data.
- Uu tien mock-first de demo chay duoc khong can Pancake token.
- Sau khi lam xong phai show diff thuc te va cach kiem tra.

## Kien truc muc tieu

```txt
ChatBot_TuVan/
  frontend/
    package.json
    index.html
    tsconfig.json
    vite.config.ts
    src/
      main.tsx
      App.tsx
      styles.css
      types.ts
      mock/
        conversations.ts
      components/
        ConversationSidebar.tsx
        ChatThread.tsx
        SuggestionPanel.tsx
```

Layout UI:

```txt
[ Sidebar hoi thoai ] [ Khung chat chinh ] [ Sidebar goi y AI ]
```

## Agent 1: Scaffold React app

Muc tieu: Tao nen React + Vite + TypeScript toi gian trong `ChatBot_TuVan/frontend`.

Pham vi file:

- `ChatBot_TuVan/frontend/package.json`
- `ChatBot_TuVan/frontend/index.html`
- `ChatBot_TuVan/frontend/tsconfig.json`
- `ChatBot_TuVan/frontend/vite.config.ts`
- `ChatBot_TuVan/frontend/src/main.tsx`
- `ChatBot_TuVan/frontend/src/App.tsx`

Yeu cau:

- App render duoc man hinh 3 cot placeholder.
- Chua can du lieu mock chi tiet.
- Khong cai thu vien UI nang.
- Script can co:
  - `npm run dev`
  - `npm run build`

Acceptance criteria:

- `npm run build` pass sau khi dependencies duoc cai.
- App co 3 vung ro rang: trai, giua, phai.
- Khong sua backend va khong sua `public/` cu.

## Agent 2: Data model va mock conversations

Muc tieu: Dinh nghia type va du lieu mock du de test luong san pham.

Pham vi file:

- `ChatBot_TuVan/frontend/src/types.ts`
- `ChatBot_TuVan/frontend/src/mock/conversations.ts`

Types toi thieu:

```ts
export type ConversationIntent = 'check_in' | 'assignment_feedback' | 'sensitive';

export type ChatMessage = {
  id: string;
  sender: 'student' | 'staff';
  text: string;
  sentAt: string;
};

export type Suggestion = {
  id: string;
  tone: string;
  content: string;
};

export type Conversation = {
  id: string;
  studentName: string;
  lastMessage: string;
  lastActiveAt: string;
  intent: ConversationIntent;
  unreadCount: number;
  messages: ChatMessage[];
  suggestions: Suggestion[];
};
```

Mock data can co 3 case:

- Hoc vien lau khong tuong tac, can check-in dong vien.
- Hoc vien gui clip/bai tap, can nhan xet bai.
- Hoc vien co noi dung nhay cam/can chu y, can tone than trong.

Acceptance criteria:

- Moi conversation co it nhat 4 message.
- Moi conversation co 2-3 suggestions.
- Noi dung goi y dung giong trung tam nhac: than thien, gon, khong may moc.

## Agent 3: Component sidebar hoi thoai

Muc tieu: Lam `ConversationSidebar` hien danh sach hoc vien de chon.

Pham vi file:

- `ChatBot_TuVan/frontend/src/components/ConversationSidebar.tsx`
- Co the sua `ChatBot_TuVan/frontend/src/App.tsx` de gan state.
- Co the sua `ChatBot_TuVan/frontend/src/styles.css` cho style lien quan.

Props de xuat:

```ts
type ConversationSidebarProps = {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
};
```

UI can co:

- Ten hoc vien.
- Preview tin cuoi.
- Thoi gian hoat dong gan nhat.
- Badge intent:
  - `Check-in`
  - `Cham bai`
  - `Can chu y`
- Unread count neu > 0.

Acceptance criteria:

- Click conversation doi thread dang chon.
- Item dang chon co style rieng.
- Sidebar khong bi vo layout khi ten/tin nhan dai.

## Agent 4: Component khung chat chinh

Muc tieu: Lam `ChatThread` hien hoi thoai va o soan tin.

Pham vi file:

- `ChatBot_TuVan/frontend/src/components/ChatThread.tsx`
- Co the sua `ChatBot_TuVan/frontend/src/App.tsx` de gan draft/send demo.
- Co the sua `ChatBot_TuVan/frontend/src/styles.css` cho style lien quan.

Props de xuat:

```ts
type ChatThreadProps = {
  conversation?: Conversation;
  draftMessage: string;
  onDraftChange: (value: string) => void;
  onSendDemo: () => void;
  onCopyDraft: () => void;
};
```

UI can co:

- Header ten hoc vien va intent.
- Danh sach message bubble:
  - hoc vien nam ben trai;
  - nhan vien nam ben phai.
- Textarea soan tin.
- Nut `Copy`.
- Nut `Gui demo`.

Acceptance criteria:

- Textarea update state dung.
- `Gui demo` them message moi vao thread local.
- Sau khi gui demo, draft duoc clear.
- Copy draft hoat dong voi Clipboard API neu trinh duyet ho tro.

## Agent 5: Component sidebar goi y AI

Muc tieu: Lam `SuggestionPanel` cho phan loai va goi y cau tra loi.

Pham vi file:

- `ChatBot_TuVan/frontend/src/components/SuggestionPanel.tsx`
- Co the sua `ChatBot_TuVan/frontend/src/App.tsx` de gan generate/use suggestion.
- Co the sua `ChatBot_TuVan/frontend/src/styles.css` cho style lien quan.

Props de xuat:

```ts
type SuggestionPanelProps = {
  conversation?: Conversation;
  suggestions: Suggestion[];
  isGenerating: boolean;
  onGenerate: () => void;
  onUseSuggestion: (content: string) => void;
};
```

UI can co:

- Nhan phan loai hien tai.
- Tom tat nhe ve muc dich:
  - check-in;
  - cham bai;
  - can chu y.
- Nut `Tao goi y`.
- 2-3 suggestion cards.
- Nut `Dung cau nay` tren tung card.

Acceptance criteria:

- Bam `Tao goi y` hien loading ngan.
- Goi y lay tu mock cua conversation dang chon.
- Bam `Dung cau nay` do noi dung vao draft o khung chat chinh.

## Agent 6: Styling va responsive toi thieu

Muc tieu: Lam UI sach, ro rang, khong can polish cao.

Pham vi file:

- `ChatBot_TuVan/frontend/src/styles.css`

Yeu cau layout:

- Desktop: 3 cot.
  - trai: 280px
  - giua: minmax(420px, 1fr)
  - phai: 360px
- Mobile/tablet hep: stack doc 1 cot.
- Mau nen sang, inbox de doc, contrast tot.
- Message bubble va suggestion card co khoang cach ro.

Acceptance criteria:

- Khong overlap text.
- Sidebar scroll doc khi co nhieu conversation.
- Chat thread scroll duoc khi nhieu message.

## Agent 7: QA va README demo

Muc tieu: Viet huong dan chay frontend demo va checklist kiem thu.

Pham vi file:

- `ChatBot_TuVan/frontend/README.md`

Noi dung can co:

- Cach cai dependencies.
- Cach chay dev server.
- Cach build.
- Mo ta luong demo:
  1. chon hoc vien;
  2. tao goi y;
  3. dung cau goi y;
  4. copy;
  5. gui demo.
- Ghi ro: chua ket noi Pancake that, chua gui tin that.

Acceptance criteria:

- Mot nguoi khac doc README co the chay demo.
- Checklist test ro rang va ngan gon.

## Thu tu giao viec de tranh conflict

1. Agent 1 scaffold truoc.
2. Agent 2 them types va mock data.
3. Agent 3, 4, 5 co the lam song song sau khi co types.
4. Agent 6 chay sau khi component co khung co ban.
5. Agent 7 viet README sau khi luong UI da on.

Neu muon chia it agent hon, gop nhu sau:

- Agent A: scaffold + types + mock.
- Agent B: 3 components + state trong App.
- Agent C: style + QA README.
