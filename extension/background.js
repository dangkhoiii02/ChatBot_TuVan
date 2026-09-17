/**
 * Thầy Minh Copilot — MV3 service worker.
 * Storage defaults + extension icon toggle.
 * E-fix: default widget is packed under extension/widget/ (chrome.runtime.getURL).
 * Dev fallback remains http://127.0.0.1:5174 via URL input / storage.
 */
const DEV_VITE_URL = 'http://127.0.0.1:5174';
const BRIDGE_SOURCE = 'thay-minh-copilot';

function packedWidgetUrl() {
  return chrome.runtime.getURL('widget/index.html');
}

function isLegacyViteDefault(url) {
  if (url == null || url === '') return true;
  try {
    const u = new URL(String(url));
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
        return u.port === '5173' || u.port === '5174';
      }
    }
  } catch (_) {
    /* fall through */
  }
  const s = String(url);
  return s.includes(':5173') || s === DEV_VITE_URL || /localhost:5174/.test(s);
}

function ensureDefaults() {
  chrome.storage.sync.get(
    ['widgetUrl', 'sidebarOpen', 'panelPosition', 'panelSize'],
    (result) => {
      const patch = {};
      // Fresh install or prior Vite-default smoke URL → packed widget.
      // Explicit custom URLs (and chrome-extension:// packed) are left alone.
      if (isLegacyViteDefault(result.widgetUrl)) {
        patch.widgetUrl = packedWidgetUrl();
      }
      if (result.sidebarOpen == null) {
        patch.sidebarOpen = true;
      }
      if (Object.keys(patch).length) {
        chrome.storage.sync.set(patch);
      }
    }
  );
}

chrome.runtime.onInstalled.addListener(ensureDefaults);
chrome.runtime.onStartup.addListener(ensureDefaults);
ensureDefaults();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'toggle-sidebar',
      source: BRIDGE_SOURCE,
    });
  } catch (err) {
    console.warn('[thay-minh] toggle failed:', err && err.message ? err.message : err);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.source !== BRIDGE_SOURCE) return;
  if (message.type === 'get-defaults') {
    sendResponse({
      widgetUrl: packedWidgetUrl(),
      devViteUrl: DEV_VITE_URL,
      panelSize: { width: 360, height: 560 },
      version: 4,
    });
    return true;
  }
});
