# Thầy Minh Copilot — Chrome Extension (X2)

MV3 extension that injects a **floating ~360×560** AI copilot panel into Pancake chat (drag ⠿ to move; corner to resize).
Hosts the packed React widget in an iframe and implements **fill-composer** via `postMessage`.

## Load unpacked

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `extension/` folder
4. Open a Pancake / pages.fm chat tab (or `http://127.0.0.1` for a smoke test)
5. You should see a floating dark panel (default bottom-right). Drag the **⠿** header to move; SE corner to resize. Position/size persist in `chrome.storage.sync` (`panelPosition`, `panelSize`)
6. Click the extension toolbar icon to toggle the sidebar
7. After code changes: click **Reload** on the extension card

## Pancake URL match (may need calibration)

Content script + host permissions currently cover:

- `https://pancake.vn/*`
- `https://*.pancake.vn/*`
- `https://pages.fm/*`
- `https://*.pages.fm/*`
- `http://localhost/*` / `http://127.0.0.1/*` (local testing)

If your tenant uses another host, add it to `manifest.json` → `content_scripts.matches`,
`host_permissions`, and `web_accessible_resources.matches`, then reload.

## Architecture

1. **Content script** (`content/inject.js`) injects a fixed overlay + **shadow DOM** host
2. Shadow hosts an iframe → `chrome.runtime.getURL('sidebar/index.html')` (shell)
3. Shell iframes the **widget URL** (Vite app, Dev 1)
4. Shell relays `postMessage`; `content/bridge.js` handles the contract on the page

## Default widget URL (E-fix)

- **Default (packed):** `chrome.runtime.getURL('widget/index.html')` — files under `extension/widget/` (synced from `widget/dist/`)
- **Dev fallback:** `http://127.0.0.1:5174` (Vite). Set via the waiting-panel URL input or:

```js
chrome.storage.sync.set({ widgetUrl: 'http://127.0.0.1:5174' })
```

- Storage key: `chrome.storage.sync.widgetUrl`
- On install/startup, empty / `*:5173` / prior Vite default `127.0.0.1:5174` migrate → **packed** URL
- After Dev 1 rebuilds the widget:

```bash
extension/scripts/sync-widget-dist.sh
```

That copies `widget/dist` → `extension/widget` and rewrites absolute `/assets/` → `./assets/` so `chrome-extension://` loads work.

## Message contract

Mirrors `ChatBot_TuVan/shared/bridge.ts`. JS mirror: `content/bridge-source.js` (`BRIDGE_SOURCE`).

Every message includes `source: 'thay-minh-copilot'`.

| Direction | Type | Behavior |
|-----------|------|----------|
| Widget→ext | `widget-ready` | Reply `bridge-ready { version: 1 }` + flat `conversation-context` |
| Widget→ext | `fill-composer` | Write text into Pancake composer; reply `fill-composer-result` |
| Ext→widget | `bridge-ready` | Handshake |
| Ext→widget | `conversation-context` | **Flat** fields: `conversationId`, `studentId`, `studentName`, `pageId`, `url` |
| Ext→widget | `fill-composer-result` | `{ ok, error?, requestId? }` |
| Ext→widget | `pancake-access-token` | `{ accessToken }` (do not log raw) |
| Ext→widget | `dom-messages-result` | `{ requestId, ok, messages?, error? }` |
| Widget→ext | `request-dom-messages` | `{ requestId }` → scrape DOM messages |

`fill-composer` never auto-sends; it only fills the composer.

## Việc cần kiểm tra trên tenant thật

- Hiệu chỉnh selector conversation id / student name / pageId trong `pancake-dom.js` nếu giao diện Pancake của tenant khác.
- Smoke test chuyển hội thoại, lấy tin nhắn, tạo gợi ý và đổ bản nháp trước khi phát hành.


## E1 — Pancake access_token + DOM messages

1. **MAIN-world hook** (`content/page-hook.js`, `document_start`): intercepts `fetch` / XHR and resource URLs for `access_token` (e.g. `/api/v1/pages?access_token=`). Posts to the content script via `source: thay-minh-copilot-hook` — **never logs the raw token**.
2. **Bridge** stores token in `chrome.storage.session` and emits `pancake-access-token` to the widget on `widget-ready` (and when newly captured). Widget still supports paste fallback if none captured.
3. **Conversation context (X3/E1):** MAIN-world hook also captures `conversationId`/`pageId` from Pancake API URLs (`/pages/{pageId}/conversations/{id}`), stashes in `sessionStorage`, and bridge emits `conversation-context` (re-emit on `widget-ready` + SPA/DOM watcher). DevTools logs only `hasId=true|false` (no PII).
4. **Fallback B**: widget `request-dom-messages` → `ThayMinhPancakeDom.getDomMessages()` → `dom-messages-result` (heuristic scrape; calibrate on live Pancake).

## Ownership

- This folder: extension (Dev 2)
- Do **not** edit `widget/`, `frontend/`, `backend/`, or `shared/` from this track (Dev 1)


## Floating panel (E1)

- Default size: **360×560** (min 280×360, max 560×900)
- Drag handle: header **⠿**
- Persisted: `chrome.storage.sync.panelPosition` `{left,top}`, `panelSize` `{width,height}`, `sidebarOpen`
- X2 bridge unchanged (`fill-composer`, flat `conversation-context`, `BRIDGE_SOURCE`)


## X3 conversation context

On `widget-ready` and whenever the active conversation appears to change, the extension emits flat:

```js
{ type: 'conversation-context', conversationId, studentId, studentName, pageId, url, source: 'thay-minh-copilot' }
```

### Selector confidence

| Field | Source | Confidence |
|-------|--------|------------|
| `conversationId` | URL path/query/hash (`conversations/{id}`, `conversation_id=`) | **sure** (when present in URL) |
| `pageId` | URL path/query (`pages/{id}`, `page_id=`) | **sure** (when present in URL) |
| `conversationId` / `pageId` | `data-conversation-id`, selected row attrs | **likely** |
| `studentName` | `data-customer-name` / similar | **likely** |
| `studentName` | conversation header text | **guess** — verify on live tenant |
| composer (X2) | textarea / contenteditable near bottom | **guess** until live smoke |

Hosts matched: `pages.fm`, `*.pages.fm`, `pancake.vn`, `*.pancake.vn`, `crm.pancake.vn`, `*.crm.pancake.vn`, localhost.

**Blocker:** selectors not verified against a live Pancake inbox session in this sprint — open DevTools on Pancake, log `ThayMinhPancakeDom.getConversationContext()`, and send real DOM snapshots to tighten X3.


## E-fix packed widget

- `extension/widget/` is the built UI (no Vite required for smoke)
- `web_accessible_resources` includes `widget/*` and `widget/assets/*`
- Manifest version **0.5.0**
- Shell logic lives in `sidebar/sidebar.js` (no inline `<script>` — MV3 CSP)
- Sync also strips `crossorigin` from packed `widget/index.html`
- Do not edit `widget/src` from this track — only consume dist via sync script
