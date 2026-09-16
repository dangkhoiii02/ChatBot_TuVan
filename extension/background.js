/**
 * Thầy Minh Copilot — MV3 service worker.
 * Storage defaults + extension icon toggle.
 */
const DEFAULT_WIDGET_URL = 'http://127.0.0.1:5174';
const BRIDGE_SOURCE = 'thay-minh-copilot';

function needsWidgetUrlMigrate(url) {
  if (url == null || url === '') return true;
  try {
    const u = new URL(String(url));
    return u.port === '5173' || /:5173\/?$/.test(String(url));
  } catch (_) {
    return String(url).includes('5173');
  }
}

function ensureDefaults() {
  chrome.storage.sync.get(
    ['widgetUrl', 'sidebarOpen', 'panelPosition', 'panelSize'],
    (result) => {
      const patch = {};
      if (needsWidgetUrlMigrate(result.widgetUrl)) {
        patch.widgetUrl = DEFAULT_WIDGET_URL;
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
      widgetUrl: DEFAULT_WIDGET_URL,
      panelSize: { width: 360, height: 560 },
      version: 3,
    });
    return true;
  }
});
