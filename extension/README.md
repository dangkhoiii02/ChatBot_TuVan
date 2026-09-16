# Thầy Minh Copilot — Chrome Extension (X2)

MV3 extension that injects a **floating ~360×560** AI copilot panel into Pancake chat (drag ⠿ to move; corner to resize).
Hosts the Dev 1 Vite React widget in an iframe and implements **fill-composer** via `postMessage`.

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

## Default widget URL

- Default: **`http://127.0.0.1:5174`** (5173 is used by the demo frontend)
- Storage key: `chrome.storage.sync.widgetUrl`
- Change via the waiting panel in the shell, or:

```js
chrome.storage.sync.set({ widgetUrl: 'http://127.0.0.1:5174' })
```

If an older install still has `localhost:5173` (or any `*:5173`) saved, overwrite then reload the tab:

```js
chrome.storage.sync.set({ widgetUrl: 'http://127.0.0.1:5174' })
```

The service worker also migrates stored `5173` → `5174` on install/startup.

## Message contract

Mirrors `ChatBot_TuVan/shared/bridge.ts`. JS mirror: `content/bridge-source.js` (`BRIDGE_SOURCE`).

Every message includes `source: 'thay-minh-copilot'`.

| Direction | Type | Behavior |
|-----------|------|----------|
| Widget→ext | `widget-ready` | Reply `bridge-ready { version: 1 }` + flat `conversation-context` |
| Widget→ext | `fill-composer` | Write text into Pancake composer; reply `fill-composer-result` |
| Ext→widget | `bridge-ready` | Handshake |
| Ext→widget | `conversation-context` | **Flat** fields: `conversationId`, `studentName`, `pageId`, `url` |
| Ext→widget | `fill-composer-result` | `{ ok, error?, requestId? }` |

`fill-composer` never auto-sends; it only fills the composer.

## X3 still open

- Calibrate conversation id / student name / pageId selectors in `pancake-dom.js`
- Re-emit `conversation-context` on conversation switch

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
{ type: 'conversation-context', conversationId, studentName, pageId, url, source: 'thay-minh-copilot' }
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
