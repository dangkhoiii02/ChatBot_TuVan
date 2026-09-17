/**
 * Pancake DOM helpers (X3 context calibration + X2 fill-composer).
 *
 * Confidence legend (no live tenant DOM available at authoring time):
 *  [sure]   URL path/query/hash patterns commonly used by pages.fm / Pancake SPA
 *  [likely] data-* attributes and selected-row conventions in chat SPAs
 *  [guess]  generic header / title text heuristics — verify on live Pancake
 */
(function (global) {
  'use strict';

  const HOST_ID = 'thay-minh-copilot-host';

  /** @type {null | (() => void)} */
  let stopWatcher = null;
  /** @type {string} */
  let lastContextKey = '';

  function isInsideCopilot(el) {
    if (!el) return false;
    let n = el;
    while (n) {
      if (n.id === HOST_ID) return true;
      if (n.nodeType === 11 && n.host) {
        n = n.host;
        continue;
      }
      n = n.parentNode || n.parentElement;
    }
    return false;
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
      return false;
    }
    return true;
  }

  function looksLikeSearch(el) {
    const attrs = [
      el.getAttribute('placeholder') || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('name') || '',
      el.id || '',
      el.className && typeof el.className === 'string' ? el.className : '',
    ]
      .join(' ')
      .toLowerCase();
    return /search|tìm kiếm|tim kiem|filter|lọc/.test(attrs);
  }

  function firstMatch(re, text) {
    const m = text && text.match(re);
    return m && m[1] ? m[1] : null;
  }

  /**
   * [sure] Prefer URL — Pancake / pages.fm often encode ids in path, hash, or query.
   */
  /** Pancake conv ids are often `pageId_senderId` (digits/underscores). */
  function looksLikeConversationId(value) {
    if (!value || typeof value !== 'string') return false;
    const v = value.trim();
    if (v.length < 6 || v.length > 200) return false;
    if (!/^[A-Za-z0-9_.\-]+$/.test(v)) return false;
    // Prefer page_sender style or long numeric / spo_…
    if (/^\d+_\d+$/.test(v)) return true;
    if (/^spo_\d+_\d+$/i.test(v)) return true;
    if (/^[A-Za-z0-9_-]{8,}$/.test(v)) return true;
    return false;
  }

  function extractFromUrl(href) {
    const url = href || (typeof location !== 'undefined' ? location.href : '');
    let conversationId = null;
    let pageId = null;

    try {
      const u = new URL(url);
      const q = u.searchParams;
      conversationId =
        q.get('conversation_id') ||
        q.get('conversationId') ||
        q.get('cid') ||
        q.get('thread_id') ||
        q.get('selected_id') ||
        q.get('customer_id') ||
        null;
      pageId = q.get('page_id') || q.get('pageId') || q.get('pid') || null;

      const pathBlob = u.pathname + ' ' + (u.hash || '');
      const decodedHash = (() => {
        try {
          return decodeURIComponent(u.hash || '');
        } catch (_) {
          return u.hash || '';
        }
      })();
      const blob = pathBlob + ' ' + decodedHash + ' ' + url;

      conversationId =
        conversationId ||
        firstMatch(/\/pages\/[^\/?#]+\/conversations\/([^\/?#]+)/i, blob) ||
        firstMatch(/conversations?\/([A-Za-z0-9_.\-]{6,})/i, blob) ||
        firstMatch(/\/c\/([A-Za-z0-9_.\-]{6,})/i, blob) ||
        firstMatch(/[#&?/]conversation[_-]?id=([A-Za-z0-9_.\-]+)/i, blob) ||
        firstMatch(/[#&?/]selected[_-]?id=([A-Za-z0-9_.\-]+)/i, blob);

      pageId =
        pageId ||
        firstMatch(/\/pages\/([A-Za-z0-9_.\-]{4,})\/conversations\//i, blob) ||
        firstMatch(/pages?\/([A-Za-z0-9_.\-]{4,})/i, blob) ||
        firstMatch(/[#&?/]page[_-]?id=([A-Za-z0-9_.\-]+)/i, blob);

      if (conversationId && !looksLikeConversationId(conversationId)) {
        conversationId = null;
      }
    } catch (_) {
      conversationId =
        firstMatch(/\/conversations\/([A-Za-z0-9_.\-]{6,})/i, url) ||
        firstMatch(/conversation[_-]?id=([A-Za-z0-9_.\-]+)/i, url);
      pageId =
        firstMatch(/\/pages\/([A-Za-z0-9_.\-]{4,})/i, url) ||
        firstMatch(/page[_-]?id=([A-Za-z0-9_.\-]+)/i, url);
    }

    return { conversationId, pageId, url };
  }

  function extractFromSessionHook() {
    try {
      const conversationId = sessionStorage.getItem('thay-minh:conversationId');
      const pageId = sessionStorage.getItem('thay-minh:pageId');
      return {
        conversationId:
          conversationId && looksLikeConversationId(conversationId)
            ? conversationId.trim()
            : null,
        pageId: pageId && String(pageId).trim() ? String(pageId).trim() : null,
      };
    } catch (_) {
      return { conversationId: null, pageId: null };
    }
  }

  function extractFromAnchorsAndAttrs() {
    let conversationId = null;
    let pageId = null;
    const nodes = document.querySelectorAll(
      'a[href*="conversation"], a[href*="inbox"], [class*="selected" i], [aria-selected="true"], [class*="active" i]'
    );
    nodes.forEach((el) => {
      if (!el || isInsideCopilot(el)) return;
      if (conversationId) return;
      const href = el.getAttribute && el.getAttribute('href');
      if (href) {
        const fromHref = extractFromUrl(
          href.startsWith('http') ? href : location.origin + (href.startsWith('/') ? href : '/' + href)
        );
        if (fromHref.conversationId) conversationId = fromHref.conversationId;
        if (fromHref.pageId && !pageId) pageId = fromHref.pageId;
      }
      if (!el.getAttributeNames) return;
      el.getAttributeNames().forEach((name) => {
        if (conversationId) return;
        const v = el.getAttribute(name);
        if (!v) return;
        if (/conversation|thread|cid|selected/i.test(name) && looksLikeConversationId(v)) {
          conversationId = v.trim();
        }
        if (/^page/i.test(name) && !pageId && v.trim().length >= 4) pageId = v.trim();
        // Value itself looks like page_sender
        if (!conversationId && /^\d{5,}_\d{5,}$/.test(v.trim())) {
          conversationId = v.trim();
        }
      });
    });
    return { conversationId, pageId };
  }

  /**
   * [likely] data attributes on selected conversation rows / chat root.
   */
  function extractFromDataAttrs() {
    const attrNames = [
      'data-conversation-id',
      'data-conversation_id',
      'data-cid',
      'data-thread-id',
      'data-page-id',
      'data-page_id',
      'data-customer-name',
      'data-contact-name',
      'data-name',
    ];

    /** @type {Element[]} */
    const roots = [];
    const selected = document.querySelectorAll(
      '[aria-selected="true"], .active, .selected, .is-active, .is-selected, [class*="selected" i], [class*="active-conversation" i]'
    );
    selected.forEach((el) => {
      if (!isInsideCopilot(el)) roots.push(el);
    });
    // Also scan chat header / main pane
    document
      .querySelectorAll(
        '[class*="conversation" i], [class*="chat-header" i], [class*="inbox" i], main, [role="main"]'
      )
      .forEach((el) => {
        if (!isInsideCopilot(el)) roots.push(el);
      });

    let conversationId = null;
    let pageId = null;
    let studentName = null;

    function readAttrs(el) {
      if (!el || !el.getAttribute) return;
      for (const name of attrNames) {
        const v = el.getAttribute(name);
        if (!v) continue;
        if (/conversation|cid|thread/i.test(name) && !conversationId) conversationId = v;
        if (/page/i.test(name) && !pageId) pageId = v;
        if (/name/i.test(name) && !studentName) studentName = v.trim();
      }
      // dataset camelCase fallbacks
      if (el.dataset) {
        if (!conversationId) {
          conversationId =
            el.dataset.conversationId ||
            el.dataset.conversation_id ||
            el.dataset.cid ||
            el.dataset.threadId ||
            null;
        }
        if (!pageId) {
          pageId = el.dataset.pageId || el.dataset.page_id || null;
        }
        if (!studentName) {
          studentName =
            el.dataset.customerName ||
            el.dataset.contactName ||
            el.dataset.name ||
            null;
        }
      }
    }

    for (const el of roots) {
      readAttrs(el);
      let p = el;
      for (let i = 0; i < 4 && p; i++) {
        readAttrs(p);
        p = p.parentElement;
      }
      if (conversationId && pageId && studentName) break;
    }

    return { conversationId, pageId, studentName };
  }

  /**
   * [guess] Visible header title near the chat pane (exclude list avatars / our host).
   */
  function extractStudentNameGuess() {
    const selectors = [
      '[class*="conversation-header" i] h1',
      '[class*="conversation-header" i] h2',
      '[class*="chat-header" i] h1',
      '[class*="chat-header" i] h2',
      '[class*="conversation-title" i]',
      '[class*="customer-name" i]',
      '[class*="contact-name" i]',
      'header h1',
      'header h2',
    ];
    for (const sel of selectors) {
      try {
        const nodes = document.querySelectorAll(sel);
        for (const el of nodes) {
          if (isInsideCopilot(el) || !isVisible(el)) continue;
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (text && text.length >= 2 && text.length <= 80 && !/pancake|inbox|hội thoại/i.test(text)) {
            return text;
          }
        }
      } catch (_) {
        /* ignore */
      }
    }
    return null;
  }

  /**
   * @returns {{
   *   conversationId: string|null,
   *   studentName: string|null,
   *   pageId: string|null,
   *   url: string,
   *   sources?: Record<string, string>
   * }}
   */
  function getConversationContext() {
    const fromHook = extractFromSessionHook();
    const fromUrl = extractFromUrl();
    const fromDom = extractFromDataAttrs();
    const fromAnchors = extractFromAnchorsAndAttrs();
    const nameGuess = extractStudentNameGuess();

    const conversationId =
      fromHook.conversationId ||
      fromUrl.conversationId ||
      fromDom.conversationId ||
      fromAnchors.conversationId ||
      null;
    const pageId =
      fromHook.pageId || fromUrl.pageId || fromDom.pageId || fromAnchors.pageId || null;
    const studentName = fromDom.studentName || nameGuess || null;

    return {
      conversationId,
      studentName,
      pageId,
      url: fromUrl.url || (typeof location !== 'undefined' ? location.href : ''),
      sources: {
        conversationId: fromHook.conversationId
          ? 'network-hook[sure]'
          : fromUrl.conversationId
            ? 'url[sure]'
            : fromDom.conversationId
              ? 'dom-attr[likely]'
              : fromAnchors.conversationId
                ? 'anchor/attr[guess]'
                : 'none',
        pageId: fromHook.pageId
          ? 'network-hook[sure]'
          : fromUrl.pageId
            ? 'url[sure]'
            : fromDom.pageId
              ? 'dom-attr[likely]'
              : fromAnchors.pageId
                ? 'anchor/attr[guess]'
                : 'none',
        studentName: fromDom.studentName
          ? 'dom-attr[likely]'
          : nameGuess
            ? 'header-text[guess]'
            : 'none',
      },
    };
  }

  function contextKey(ctx) {
    return [ctx.conversationId || '', ctx.pageId || '', ctx.studentName || '', ctx.url || ''].join('|');
  }

  /**
   * Watch URL + DOM; invoke onChange when flat context identity changes.
   * @param {(ctx: ReturnType<typeof getConversationContext>) => void} onChange
   */
  function startContextWatcher(onChange) {
    stopContextWatcher();
    if (typeof onChange !== 'function') return;

    const emit = () => {
      const ctx = getConversationContext();
      const key = contextKey(ctx);
      if (key === lastContextKey) return;
      lastContextKey = key;
      try {
        onChange(ctx);
      } catch (err) {
        console.warn('[thay-minh] context watcher callback failed:', err);
      }
    };

    // Initial
    emit();

    const onUrl = () => emit();
    window.addEventListener('hashchange', onUrl);
    window.addEventListener('popstate', onUrl);

    // Patch history push/replace for SPA navigations
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
      const ret = origPush.apply(this, arguments);
      queueMicrotask(emit);
      return ret;
    };
    history.replaceState = function () {
      const ret = origReplace.apply(this, arguments);
      queueMicrotask(emit);
      return ret;
    };

    let debounce = null;
    const obs = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(emit, 200);
    });
    try {
      obs.observe(document.documentElement || document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          'aria-selected',
          'class',
          'data-conversation-id',
          'data-conversation_id',
          'data-page-id',
          'data-page_id',
          'data-cid',
        ],
      });
    } catch (_) {
      /* ignore */
    }

    // Lightweight poll as fallback for silent SPA updates
    const interval = setInterval(emit, 800);

    stopWatcher = () => {
      window.removeEventListener('hashchange', onUrl);
      window.removeEventListener('popstate', onUrl);
      history.pushState = origPush;
      history.replaceState = origReplace;
      obs.disconnect();
      clearInterval(interval);
      if (debounce) clearTimeout(debounce);
      stopWatcher = null;
    };
  }

  function stopContextWatcher() {
    if (typeof stopWatcher === 'function') {
      try {
        stopWatcher();
      } catch (_) {
        /* ignore */
      }
    }
    stopWatcher = null;
  }

  function findComposer() {
    const selectors = [
      'textarea[placeholder*="nhập" i]',
      'textarea[placeholder*="Nhập" i]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="tin nhắn" i]',
      'div[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
      'textarea',
      'div[role="textbox"]',
      '[data-testid*="composer" i]',
      '.composer textarea',
      '.chat-input textarea',
      'input[type="text"]',
    ];

    /** @type {Element[]} */
    const candidates = [];
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => candidates.push(el));
      } catch (_) {
        /* ignore */
      }
    }

    const scored = candidates
      .filter((el) => el && !isInsideCopilot(el) && isVisible(el) && !looksLikeSearch(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        const bottomBias = r.top / Math.max(window.innerHeight, 1);
        return { el, score: area + bottomBias * 5000 };
      })
      .sort((a, b) => b.score - a.score);

    return scored.length ? scored[0].el : null;
  }

  function setNativeValue(el, text) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : el instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : null;
    if (proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {
        desc.set.call(el, text);
        return;
      }
    }
    el.value = text;
  }

  function dispatchInputEvents(el, text) {
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        })
      );
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillComposer(text) {
    const value = text == null ? '' : String(text);
    const el = findComposer();
    if (!el) return { ok: false, error: 'composer-not-found' };

    try {
      el.focus();
      const isEditable =
        el.isContentEditable ||
        (el.getAttribute && el.getAttribute('contenteditable') === 'true');

      if (isEditable) {
        if (document.execCommand) {
          try {
            document.execCommand('selectAll', false, null);
            const ok = document.execCommand('insertText', false, value);
            if (!ok) el.textContent = value;
          } catch (_) {
            el.textContent = value;
          }
        } else {
          el.textContent = value;
        }
        dispatchInputEvents(el, value);
      } else {
        setNativeValue(el, value);
        dispatchInputEvents(el, value);
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: 'fill-failed: ' + (err && err.message ? err.message : String(err)),
      };
    }
  }


  /**
   * Scrape visible chat messages for fallback B (heuristic — calibrate on live Pancake).
   * @returns {{ ok: boolean, messages?: Array<{id:string,sender:string,text:string,createdAt:string,senderName?:string}>, error?: string }}
   */
  function getDomMessages() {
    try {
      const roots = [];
      document
        .querySelectorAll(
          '[class*="message-list" i], [class*="messages" i], [class*="chat-body" i], [class*="conversation-body" i], [role="log"], [class*="inbox-chat" i], main, [role="main"]'
        )
        .forEach((el) => {
          if (el && !isInsideCopilot(el)) roots.push(el);
        });
      const searchRoot = roots[0] || document.body;
      if (!searchRoot) return { ok: false, error: 'no-dom-root' };

      const nodeList = searchRoot.querySelectorAll(
        '[data-message-id], [data-msg-id], [class*="message-item" i], [class*="chat-message" i], [class*="bubble" i], [class*="msg-" i]'
      );
      /** @type {Element[]} */
      const nodes = [];
      nodeList.forEach((el) => {
        if (!el || isInsideCopilot(el) || !isVisible(el)) return;
        // Prefer leaf-ish bubbles: skip containers that wrap many bubbles
        const childBubbles = el.querySelectorAll(
          '[class*="bubble" i], [class*="message-item" i], [data-message-id]'
        );
        if (childBubbles.length > 2) return;
        nodes.push(el);
      });

      const midX = (window.innerWidth || 1200) / 2;
      const seen = new Set();
      /** @type {Array<{id:string,sender:'student'|'staff'|'system',text:string,createdAt:string,senderName?:string}>} */
      const messages = [];

      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 1 || text.length > 4000) continue;
        // Skip pure timestamps / chrome chrome
        if (/^\d{1,2}:\d{2}$/.test(text)) continue;

        const idAttr =
          el.getAttribute('data-message-id') ||
          el.getAttribute('data-msg-id') ||
          el.getAttribute('data-id') ||
          '';
        const id = idAttr || 'dom-' + i + '-' + text.slice(0, 24);

        if (seen.has(id) || seen.has(text)) continue;
        seen.add(id);
        seen.add(text);

        const cls = (
          (el.className && typeof el.className === 'string' ? el.className : '') +
          ' ' +
          (el.parentElement && typeof el.parentElement.className === 'string'
            ? el.parentElement.className
            : '')
        ).toLowerCase();

        let sender = /** @type {'student'|'staff'|'system'} */ ('student');
        if (/system|bot|auto|note|ghi chú/.test(cls + ' ' + text.slice(0, 40).toLowerCase())) {
          sender = 'system';
        } else if (
          /outbound|outgoing|mine|is-me|from-me|agent|staff|page-message|right/.test(cls)
        ) {
          sender = 'staff';
        } else if (/inbound|incoming|customer|visitor|left|from-them/.test(cls)) {
          sender = 'student';
        } else {
          const r = el.getBoundingClientRect();
          // Right-biased bubbles → staff (common chat layout)
          sender = r.left + r.width / 2 > midX ? 'staff' : 'student';
        }

        let senderName;
        const nameEl = el.querySelector(
          '[class*="sender" i], [class*="author" i], [class*="name" i]'
        );
        if (nameEl) {
          const n = (nameEl.textContent || '').trim();
          if (n && n.length < 80) senderName = n;
        }

        messages.push({
          id: String(id),
          sender,
          text,
          createdAt: new Date().toISOString(),
          senderName,
        });
      }

      // Keep last 50
      const sliced = messages.slice(-50);
      if (!sliced.length) return { ok: false, error: 'no-messages-found' };
      return { ok: true, messages: sliced };
    } catch (err) {
      return {
        ok: false,
        error:
          'dom-scrape-failed: ' +
          (err && err.message ? err.message : String(err)),
      };
    }
  }

  global.ThayMinhPancakeDom = {
    getConversationContext,
    fillComposer,
    findComposer,
    getDomMessages,
    startContextWatcher,
    stopContextWatcher,
    SELECTORS: {
      // Documented confidence — refine after live smoke test
      conversationIdUrl: 'path/query/hash [sure]',
      pageIdUrl: 'path/query/hash [sure]',
      conversationIdDom: 'data-conversation-id / selected row [likely]',
      studentNameDom: 'data-customer-name [likely] / header text [guess]',
      composer:
        'textarea / [contenteditable] / [role=textbox] near bottom [guess until live]',
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
