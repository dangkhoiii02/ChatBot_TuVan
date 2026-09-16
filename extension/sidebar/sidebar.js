/**
 * Thầy Minh Copilot — sidebar shell (E-fix2).
 * External script so MV3 extension CSP script-src 'self' allows it.
 */
    // Must match shared/bridge.ts BRIDGE_SOURCE (JS mirror in content/bridge-source.js)
    const BRIDGE_SOURCE = 'thay-minh-copilot';
    const DEV_VITE_URL = 'http://127.0.0.1:5174';
    const DEFAULT_WIDGET_URL =
      (typeof chrome !== 'undefined' &&
        chrome.runtime &&
        typeof chrome.runtime.getURL === 'function' &&
        chrome.runtime.getURL('widget/index.html')) ||
      DEV_VITE_URL;

    const waitingEl = document.getElementById('waiting');
    const frame = document.getElementById('widget-frame');
    const urlInput = document.getElementById('widget-url-input');
    const btnSave = document.getElementById('btn-save-reload');
    const btnRetry = document.getElementById('btn-retry');

    let currentUrl = DEFAULT_WIDGET_URL;
    let hideWaitingTimer = null;

    function showWaiting(show) {
      waitingEl.classList.toggle('visible', !!show);
    }

    function loadWidget(url) {
      currentUrl = url || DEFAULT_WIDGET_URL;
      urlInput.value = currentUrl;
      showWaiting(true);
      frame.src = currentUrl;
      if (hideWaitingTimer) clearTimeout(hideWaitingTimer);
      hideWaitingTimer = setTimeout(() => showWaiting(false), 2500);
    }

    frame.addEventListener('load', () => {});

    btnSave.addEventListener('click', () => {
      const next = (urlInput.value || '').trim() || DEFAULT_WIDGET_URL;
      chrome.storage.sync.set({ widgetUrl: next }, () => loadWidget(next));
    });

    btnRetry.addEventListener('click', () => loadWidget(currentUrl));

    // Relay widget↔extension messages through this shell so the content-script
    // bridge sees a single iframe target (hybrid architecture).
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.source !== BRIDGE_SOURCE) return;

      // Widget → parent page (content script bridge listens on window)
      if (event.source === frame.contentWindow) {
        if (data.type === 'widget-ready') {
          showWaiting(false);
        }
        try {
          window.parent.postMessage(data, '*');
        } catch (_) { /* ignore */ }
        return;
      }

      // Extension / page → widget
      if (frame.contentWindow && event.source !== frame.contentWindow) {
        try {
          frame.contentWindow.postMessage(data, '*');
        } catch (_) { /* ignore */ }
      }
    });

    chrome.storage.sync.get({ widgetUrl: DEFAULT_WIDGET_URL }, (result) => {
      loadWidget(result.widgetUrl || DEFAULT_WIDGET_URL);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.widgetUrl) return;
      const next = changes.widgetUrl.newValue || DEFAULT_WIDGET_URL;
      if (next !== currentUrl) loadWidget(next);
    });
