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
  const PAGE_STORAGE_KEY = 'thay-minh:pancakeAccessToken';

  /** @type {HTMLIFrameElement|null} */
  let targetFrame = null;
  let listening = false;
  /** @type {string|null} */
  let cachedAccessToken = null;
  /** @type {string} */
  let lastEmittedContextKey = '';
  /** @type {ReturnType<typeof setTimeout>|null} */
  let contextEmitTimer = null;

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
    try {
      sessionStorage.setItem(PAGE_STORAGE_KEY, token);
    } catch (_) {
      /* ignore */
    }
    notifyTokenStatus(true);
  }

  function notifyTokenStatus(hasToken) {
    try {
      window.dispatchEvent(
        new CustomEvent('thay-minh-token-status', {
          detail: { hasToken: !!hasToken },
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function readPageStorageToken() {
    try {
      const t = sessionStorage.getItem(PAGE_STORAGE_KEY);
      if (t && String(t).trim().length >= 16) return String(t).trim();
    } catch (_) {
      /* ignore */
    }
    return null;
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

  function contextKeyOf(c) {
    return [
      c && c.conversationId != null ? String(c.conversationId) : '',
      c && c.pageId != null ? String(c.pageId) : '',
      c && c.studentName != null ? String(c.studentName) : '',
    ].join('|');
  }

  function pushConversationContext(ctx, opts) {
    const force = !!(opts && opts.force);
    try {
      const c =
        ctx ||
        (global.ThayMinhPancakeDom &&
        typeof global.ThayMinhPancakeDom.getConversationContext === 'function'
          ? global.ThayMinhPancakeDom.getConversationContext()
          : {});
      const key = contextKeyOf(c);
      if (!force && key === lastEmittedContextKey) {
        return;
      }
      lastEmittedContextKey = key;
      const hasId = !!(c.conversationId != null && String(c.conversationId).trim());
      try {
        console.info('[thay-minh] conversation-context hasId=', hasId);
      } catch (_) {}
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

  /** Debounced emit for noisy network/DOM hooks (avoids widget thrash). */
  function schedulePushConversationContext() {
    if (contextEmitTimer) clearTimeout(contextEmitTimer);
    contextEmitTimer = setTimeout(() => {
      contextEmitTimer = null;
      pushConversationContext();
    }, 400);
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
        pushConversationContext(null, { force: true });
        loadStoredToken((token) => {
          const t =
            token ||
            readPageStorageToken() ||
            scanPerfForToken() ||
            cachedAccessToken;
          if (t) pushAccessToken(t);
          else notifyTokenStatus(false);
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

    if (data.type === 'captured-access-token') {
      const t = data.accessToken != null ? String(data.accessToken).trim() : '';
      if (!t) return;
      const prev = cachedAccessToken;
      persistToken(t);
      if (t !== prev || targetFrame) {
        pushAccessToken(t);
      }
      return;
    }

    if (data.type === 'captured-conversation') {
      const cid =
        data.conversationId != null ? String(data.conversationId).trim() : '';
      if (!cid) return;
      let prev = '';
      try {
        prev = sessionStorage.getItem('thay-minh:conversationId') || '';
        sessionStorage.setItem('thay-minh:conversationId', cid);
        if (data.pageId) {
          sessionStorage.setItem('thay-minh:pageId', String(data.pageId));
        }
      } catch (_) {}
      // Only emit when id actually changes (network can repeat same conv)
      if (cid !== prev) {
        schedulePushConversationContext();
      }
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
        // Deduped inside push; light debounce for mutation storms
        schedulePushConversationContext();
        void ctx;
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
      const t =
        cachedAccessToken || readPageStorageToken() || scanPerfForToken();
      if (t) {
        persistToken(t);
        if (targetFrame) pushAccessToken(t);
        else notifyTokenStatus(true);
      } else {
        notifyTokenStatus(false);
      }
    });

    // Poll page sessionStorage + perf (covers F5 race: hook wrote before bridge listened)
    if (!global.__thayMinhTokenPoll) {
      global.__thayMinhTokenPoll = setInterval(() => {
        if (cachedAccessToken) return;
        const t = readPageStorageToken() || scanPerfForToken();
        if (t) {
          persistToken(t);
          if (targetFrame) pushAccessToken(t);
        }
      }, 1500);
    }

    const onNav = () => {
      const t = readPageStorageToken() || scanPerfForToken();
      if (t) {
        persistToken(t);
        if (targetFrame) pushAccessToken(t);
      }
    };
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
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
