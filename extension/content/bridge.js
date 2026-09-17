/**
 * postMessage bridge between Pancake page ↔ sidebar shell ↔ widget (X2 + X3 + E1).
 *
 * Contract mirrors ChatBot_TuVan/shared/bridge.ts (via content/bridge-source.js):
 *   Every message: source: BRIDGE_SOURCE ('thay-minh-copilot')
 *   Widget→ext: fill-composer, widget-ready, widget-resize, request-dom-messages
 *   Ext→widget: bridge-ready, fill-composer-result, conversation-context,
 *               pancake-access-token, dom-messages-result
 */
(function (global) {
  'use strict';

  const contract = global.ThayMinhBridgeContract || {
    BRIDGE_SOURCE: 'thay-minh-copilot',
    BRIDGE_VERSION: 1,
  };
  const BRIDGE_SOURCE = contract.BRIDGE_SOURCE;
  const BRIDGE_VERSION = contract.BRIDGE_VERSION;
  const HOOK_SOURCE = 'thay-minh-copilot-hook';
  const SESSION_KEY = 'pancakeAccessToken';

  /** @type {HTMLIFrameElement|null} */
  let targetFrame = null;
  let listening = false;
  /** @type {string|null} */
  let cachedAccessToken = null;

  function isCopilotMessage(data) {
    return data && typeof data === 'object' && data.source === BRIDGE_SOURCE;
  }

  function postToWidget(payload) {
    if (!targetFrame || !targetFrame.contentWindow) return;
    try {
      targetFrame.contentWindow.postMessage(
        { source: BRIDGE_SOURCE, ...payload },
        '*'
      );
    } catch (err) {
      console.warn('[thay-minh] postToWidget failed:', err);
    }
  }

  function persistToken(token) {
    cachedAccessToken = token;
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.session &&
        typeof chrome.storage.session.set === 'function'
      ) {
        chrome.storage.session.set({ [SESSION_KEY]: token });
      }
    } catch (_) {
      /* ignore */
    }
  }

  function pushAccessToken(token) {
    const t = (token != null ? String(token) : cachedAccessToken || '').trim();
    if (!t) return;
    persistToken(t);
    postToWidget({
      type: 'pancake-access-token',
      accessToken: t,
    });
  }

  function loadStoredToken(done) {
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.session &&
        typeof chrome.storage.session.get === 'function'
      ) {
        chrome.storage.session.get([SESSION_KEY], (result) => {
          const t =
            result && result[SESSION_KEY] != null
              ? String(result[SESSION_KEY]).trim()
              : '';
          if (t) cachedAccessToken = t;
          if (typeof done === 'function') done(cachedAccessToken);
        });
        return;
      }
    } catch (_) {
      /* ignore */
    }
    if (typeof done === 'function') done(cachedAccessToken);
  }

  function extractTokenFromUrl(url) {
    try {
      const u = new URL(String(url), location.href);
      return (
        u.searchParams.get('access_token') ||
        u.searchParams.get('accessToken') ||
        null
      );
    } catch (_) {
      const m = String(url || '').match(/[?&]access_token=([^&#]+)/i);
      if (!m) return null;
      try {
        return decodeURIComponent(m[1]);
      } catch (e) {
        return m[1];
      }
    }
  }

  function scanPerfForToken() {
    try {
      const entries = performance.getEntriesByType('resource');
      for (let i = entries.length - 1; i >= 0; i--) {
        const name = entries[i] && entries[i].name;
        if (!name || !/pancake\.vn|pages\.fm|\/api\/v1\//i.test(name)) continue;
        const t = extractTokenFromUrl(name);
        if (t && t.trim().length >= 16) {
          persistToken(t.trim());
          return t.trim();
        }
      }
    } catch (_) {
      /* ignore */
    }
    try {
      const t = extractTokenFromUrl(location.href);
      if (t && t.trim().length >= 16) {
        persistToken(t.trim());
        return t.trim();
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function pushConversationContext(ctx) {
    try {
      const c =
        ctx ||
        (global.ThayMinhPancakeDom &&
        typeof global.ThayMinhPancakeDom.getConversationContext === 'function'
          ? global.ThayMinhPancakeDom.getConversationContext()
          : {});
      postToWidget({
        type: 'conversation-context',
        conversationId: c.conversationId != null ? c.conversationId : null,
        studentName: c.studentName != null ? c.studentName : null,
        pageId: c.pageId != null ? c.pageId : null,
        url:
          c.url != null
            ? c.url
            : typeof location !== 'undefined'
              ? location.href
              : undefined,
      });
    } catch (err) {
      console.warn('[thay-minh] conversation-context failed:', err);
    }
  }

  function handleDomMessagesRequest(requestId) {
    let result = { ok: false, error: 'pancake-dom-missing' };
    try {
      if (
        global.ThayMinhPancakeDom &&
        typeof global.ThayMinhPancakeDom.getDomMessages === 'function'
      ) {
        result = global.ThayMinhPancakeDom.getDomMessages() || result;
      }
    } catch (err) {
      result = {
        ok: false,
        error:
          'dom-failed: ' +
          (err && err.message ? err.message : String(err)),
      };
    }
    postToWidget({
      type: 'dom-messages-result',
      requestId: requestId != null ? String(requestId) : '',
      ok: !!result.ok,
      messages: result.ok ? result.messages || [] : undefined,
      error: result.ok ? undefined : result.error || 'dom-failed',
    });
  }

  function handleIncoming(event) {
    const data = event.data;
    if (!isCopilotMessage(data)) return;

    switch (data.type) {
      case 'widget-ready':
        postToWidget({ type: 'bridge-ready', version: BRIDGE_VERSION });
        pushConversationContext();
        loadStoredToken((token) => {
          const t = token || scanPerfForToken() || cachedAccessToken;
          if (t) pushAccessToken(t);
        });
        break;

      case 'fill-composer': {
        const text = data.text != null ? String(data.text) : '';
        let result = { ok: false, error: 'pancake-dom-missing' };
        try {
          if (
            global.ThayMinhPancakeDom &&
            typeof global.ThayMinhPancakeDom.fillComposer === 'function'
          ) {
            result = global.ThayMinhPancakeDom.fillComposer(text) || result;
          }
        } catch (err) {
          result = {
            ok: false,
            error:
              'fill-failed: ' +
              (err && err.message ? err.message : String(err)),
          };
        }
        postToWidget({
          type: 'fill-composer-result',
          ok: !!result.ok,
          error: result.ok ? undefined : result.error || 'fill-failed',
          requestId: data.requestId != null ? data.requestId : undefined,
        });
        break;
      }

      case 'request-dom-messages':
        handleDomMessagesRequest(
          data.requestId != null ? data.requestId : ''
        );
        break;

      case 'widget-resize':
        break;

      default:
        break;
    }
  }

  function handleHookMessage(event) {
    // Page-world hook posts to the same window
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.source !== HOOK_SOURCE) return;
    if (data.type !== 'captured-access-token') return;
    const t = data.accessToken != null ? String(data.accessToken).trim() : '';
    if (!t) return;
    const prev = cachedAccessToken;
    persistToken(t);
    // Push to widget when new or when we already have a frame
    if (t !== prev || targetFrame) {
      pushAccessToken(t);
    }
  }

  function setTargetFrame(iframe) {
    targetFrame = iframe || null;
  }

  function ensureWatcher() {
    if (
      global.ThayMinhPancakeDom &&
      typeof global.ThayMinhPancakeDom.startContextWatcher === 'function'
    ) {
      global.ThayMinhPancakeDom.startContextWatcher((ctx) => {
        pushConversationContext(ctx);
      });
    }
  }

  function start() {
    if (!listening) {
      window.addEventListener('message', handleIncoming);
      window.addEventListener('message', handleHookMessage);
      listening = true;
    }
    ensureWatcher();
    loadStoredToken(() => {
      scanPerfForToken();
    });
  }

  function stop() {
    if (listening) {
      window.removeEventListener('message', handleIncoming);
      window.removeEventListener('message', handleHookMessage);
      listening = false;
    }
    if (
      global.ThayMinhPancakeDom &&
      typeof global.ThayMinhPancakeDom.stopContextWatcher === 'function'
    ) {
      global.ThayMinhPancakeDom.stopContextWatcher();
    }
  }

  global.ThayMinhBridge = {
    BRIDGE_SOURCE,
    SOURCE: BRIDGE_SOURCE,
    BRIDGE_VERSION,
    start,
    stop,
    setTargetFrame,
    postToWidget,
    pushConversationContext,
    pushAccessToken,
  };
})(typeof window !== 'undefined' ? window : globalThis);
