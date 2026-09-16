/**
 * postMessage bridge between Pancake page ↔ sidebar shell ↔ widget (X2 + X3).
 *
 * Contract mirrors ChatBot_TuVan/shared/bridge.ts (via content/bridge-source.js):
 *   Every message: source: BRIDGE_SOURCE ('thay-minh-copilot')
 *   Widget→ext: fill-composer, widget-ready, widget-resize
 *   Ext→widget: bridge-ready, fill-composer-result, conversation-context (flat fields)
 */
(function (global) {
  'use strict';

  const contract = global.ThayMinhBridgeContract || {
    BRIDGE_SOURCE: 'thay-minh-copilot',
    BRIDGE_VERSION: 1,
  };
  const BRIDGE_SOURCE = contract.BRIDGE_SOURCE;
  const BRIDGE_VERSION = contract.BRIDGE_VERSION;

  /** @type {HTMLIFrameElement|null} */
  let targetFrame = null;
  let listening = false;

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

  function handleIncoming(event) {
    const data = event.data;
    if (!isCopilotMessage(data)) return;

    switch (data.type) {
      case 'widget-ready':
        postToWidget({ type: 'bridge-ready', version: BRIDGE_VERSION });
        pushConversationContext();
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

      case 'widget-resize':
        break;

      default:
        break;
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
      listening = true;
    }
    ensureWatcher();
  }

  function stop() {
    if (listening) {
      window.removeEventListener('message', handleIncoming);
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
