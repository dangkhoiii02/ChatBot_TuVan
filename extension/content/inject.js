/**
 * Main content script: floating compact panel + shadow DOM (E1).
 * Architecture:
 *   1) Shadow host
 *   2) Floating panel (~360×560) with drag handle ⠿ + optional resize
 *   3) iframe → chrome.runtime.getURL('sidebar/index.html') shell
 *   4) Shell iframes widgetUrl (default packed widget/ via getURL; Vite 5174 fallback)
 * Bridge (X2) unchanged: fill-composer / flat conversation-context / BRIDGE_SOURCE.
 */
(function () {
  'use strict';

  const HOST_ID = 'thay-minh-copilot-host';
  const DEFAULT_SIZE = { width: 360, height: 560 };
  const MIN_SIZE = { width: 280, height: 360 };
  const MAX_SIZE = { width: 560, height: 900 };
  const MARGIN = 12;
  const BRIDGE_SOURCE =
    (globalThis.ThayMinhBridgeContract &&
      globalThis.ThayMinhBridgeContract.BRIDGE_SOURCE) ||
    'thay-minh-copilot';
  const DEV_VITE_URL = 'http://127.0.0.1:5174';
  const DEFAULT_WIDGET_URL =
    (typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === 'function' &&
      chrome.runtime.getURL('widget/index.html')) ||
    DEV_VITE_URL;

  if (document.getElementById(HOST_ID)) {
    return;
  }

  let open = true;
  let hostEl = null;
  let shadow = null;
  let panelEl = null;
  let dragBar = null;
  let toggleBtn = null;
  let shellIframe = null;
  let resizeHandle = null;
  /** @type {HTMLElement|null} */
  let tokenBadgeEl = null;

  /** @type {{ left: number, top: number }} */
  let position = defaultPosition();
  /** @type {{ width: number, height: number }} */
  let size = { ...DEFAULT_SIZE };

  let dragState = null;
  let resizeState = null;
  let persistTimer = null;

  function defaultPosition() {
    const w = DEFAULT_SIZE.width;
    const h = DEFAULT_SIZE.height;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    return {
      left: Math.max(MARGIN, vw - w - MARGIN),
      top: Math.max(MARGIN, vh - h - MARGIN),
    };
  }

  function clampPosition(pos, sz) {
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const maxLeft = Math.max(MARGIN, vw - sz.width - MARGIN);
    const maxTop = Math.max(MARGIN, vh - sz.height - MARGIN);
    return {
      left: Math.min(Math.max(MARGIN, pos.left), maxLeft),
      top: Math.min(Math.max(MARGIN, pos.top), maxTop),
    };
  }

  function clampSize(sz) {
    return {
      width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, Math.round(sz.width))),
      height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, Math.round(sz.height))),
    };
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        chrome.storage.sync.set({
          panelPosition: { left: position.left, top: position.top },
          panelSize: { width: size.width, height: size.height },
          sidebarOpen: open,
        });
      } catch (_) {
        /* ignore */
      }
    }, 120);
  }

  function applyGeometry() {
    position = clampPosition(position, size);
    size = clampSize(size);
    if (!panelEl) return;
    panelEl.style.left = position.left + 'px';
    panelEl.style.top = position.top + 'px';
    panelEl.style.width = size.width + 'px';
    panelEl.style.height = size.height + 'px';
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    if (toggleBtn) {
      // Park FAB near panel when open, or at last panel anchor when closed
      const fabLeft = open
        ? Math.max(MARGIN, position.left - 36)
        : Math.min(
            (window.innerWidth || 1280) - 44,
            position.left + size.width - 40
          );
      const fabTop = Math.min(
        Math.max(MARGIN, position.top + 8),
        (window.innerHeight || 800) - 48
      );
      toggleBtn.style.left = fabLeft + 'px';
      toggleBtn.style.top = fabTop + 'px';
      toggleBtn.style.right = 'auto';
    }
  }

  function applyOpenState(isOpen, persist) {
    open = !!isOpen;
    if (panelEl) {
      panelEl.classList.toggle('tm-hidden', !open);
      panelEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (toggleBtn) {
      toggleBtn.textContent = open ? '›' : '‹';
      toggleBtn.setAttribute(
        'aria-label',
        open ? 'Đóng Thầy Minh Copilot' : 'Mở Thầy Minh Copilot'
      );
      toggleBtn.title = open ? 'Đóng panel' : 'Mở panel';
    }
    applyGeometry();
    if (persist !== false) schedulePersist();
  }

  function onPointerMove(e) {
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      position = clampPosition(
        {
          left: dragState.originLeft + dx,
          top: dragState.originTop + dy,
        },
        size
      );
      applyGeometry();
      e.preventDefault();
      return;
    }
    if (resizeState) {
      const dx = e.clientX - resizeState.startX;
      const dy = e.clientY - resizeState.startY;
      size = clampSize({
        width: resizeState.originW + dx,
        height: resizeState.originH + dy,
      });
      position = clampPosition(position, size);
      applyGeometry();
      e.preventDefault();
    }
  }

  function onPointerUp() {
    if (!dragState && !resizeState) return;
    dragState = null;
    resizeState = null;
    if (panelEl) panelEl.classList.remove('tm-dragging');
    if (shellIframe) shellIframe.style.pointerEvents = '';
    schedulePersist();
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
  }

  function beginDrag(e) {
    if (e.button != null && e.button !== 0) return;
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      originLeft: position.left,
      originTop: position.top,
    };
    if (panelEl) panelEl.classList.add('tm-dragging');
    // Avoid iframe eating events mid-drag
    if (shellIframe) shellIframe.style.pointerEvents = 'none';
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    e.preventDefault();
  }

  function beginResize(e) {
    if (e.button != null && e.button !== 0) return;
    resizeState = {
      startX: e.clientX,
      startY: e.clientY,
      originW: size.width,
      originH: size.height,
    };
    if (panelEl) panelEl.classList.add('tm-dragging');
    if (shellIframe) shellIframe.style.pointerEvents = 'none';
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    e.preventDefault();
    e.stopPropagation();
  }

  function setTokenBadge(hasToken) {
    if (!tokenBadgeEl) return;
    if (hasToken) {
      tokenBadgeEl.textContent = 'Token ✓';
      tokenBadgeEl.classList.add('tm-token-ok');
      tokenBadgeEl.title = 'Đã bắt Pancake access token (không hiện raw)';
    } else {
      tokenBadgeEl.textContent = 'Chưa token';
      tokenBadgeEl.classList.remove('tm-token-ok');
      tokenBadgeEl.title = 'Chưa bắt được token — F5 Pancake hoặc paste trong widget';
    }
  }

  function buildUi() {
    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    hostEl.setAttribute('data-thay-minh', '1');
    Object.assign(hostEl.style, {
      all: 'initial',
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      zIndex: '2147483646',
      pointerEvents: 'none',
    });

    shadow = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .tm-root {
        position: fixed;
        inset: 0;
        pointer-events: none;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .tm-panel {
        position: fixed;
        z-index: 2147483646;
        pointer-events: auto;
        background: #0f172a;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.35);
        border-radius: 14px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: opacity 0.18s ease, box-shadow 0.18s ease;
      }
      .tm-panel.tm-hidden {
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      }
      .tm-panel.tm-dragging {
        box-shadow: 0 22px 56px rgba(15, 23, 42, 0.45);
        transition: none;
        user-select: none;
      }
      .tm-drag {
        flex: 0 0 36px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 10px;
        background: linear-gradient(180deg, #1e293b, #0f172a);
        color: #e2e8f0;
        cursor: grab;
        border-bottom: 1px solid rgba(148, 163, 184, 0.22);
        user-select: none;
        touch-action: none;
      }
      .tm-panel.tm-dragging .tm-drag { cursor: grabbing; }
      .tm-drag-grip {
        letter-spacing: -2px;
        opacity: 0.75;
        font-size: 14px;
        line-height: 1;
      }
      .tm-drag-title {
        flex: 1;
        font-size: 12px;
        font-weight: 600;
        opacity: 0.92;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tm-token-badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 3px 7px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(51, 65, 85, 0.7);
        color: #94a3b8;
        max-width: 110px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tm-token-badge.tm-token-ok {
        border-color: rgba(34, 197, 94, 0.45);
        background: rgba(22, 101, 52, 0.35);
        color: #86efac;
      }
      .tm-drag-close {
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
      .tm-drag-close:hover { background: rgba(148, 163, 184, 0.18); color: #fff; }
      .tm-panel iframe {
        flex: 1;
        width: 100%;
        min-height: 0;
        border: 0;
        background: #0f172a;
      }
      .tm-resize {
        position: absolute;
        right: 2px;
        bottom: 2px;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        touch-action: none;
        background:
          linear-gradient(135deg, transparent 50%, rgba(148,163,184,0.55) 50%) ;
        border-radius: 2px;
        opacity: 0.7;
      }
      .tm-resize:hover { opacity: 1; }
      .tm-toggle {
        position: fixed;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: linear-gradient(180deg, #1e293b, #0f172a);
        color: #e2e8f0;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        pointer-events: auto;
        z-index: 2147483647;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.3);
      }
      .tm-toggle:hover {
        background: linear-gradient(180deg, #334155, #1e293b);
      }
    `;

    const root = document.createElement('div');
    root.className = 'tm-root';

    panelEl = document.createElement('aside');
    panelEl.className = 'tm-panel';
    panelEl.setAttribute('role', 'complementary');
    panelEl.setAttribute('aria-label', 'Thầy Minh Copilot');

    dragBar = document.createElement('div');
    dragBar.className = 'tm-drag';
    dragBar.setAttribute('role', 'toolbar');
    dragBar.setAttribute('aria-label', 'Kéo di chuyển panel');
    dragBar.innerHTML =
      '<span class="tm-drag-grip" aria-hidden="true">⠿</span>' +
      '<span class="tm-drag-title">Thầy Minh Copilot</span>';
    tokenBadgeEl = document.createElement('span');
    tokenBadgeEl.className = 'tm-token-badge';
    tokenBadgeEl.setAttribute('aria-live', 'polite');
    setTokenBadge(false);
    dragBar.appendChild(tokenBadgeEl);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tm-drag-close';
    closeBtn.setAttribute('aria-label', 'Đóng');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      applyOpenState(false);
    });
    dragBar.appendChild(closeBtn);
    dragBar.addEventListener('pointerdown', beginDrag);

    shellIframe = document.createElement('iframe');
    shellIframe.src = chrome.runtime.getURL('sidebar/index.html');
    shellIframe.title = 'Thầy Minh Copilot';
    shellIframe.allow = 'clipboard-read; clipboard-write';

    resizeHandle = document.createElement('div');
    resizeHandle.className = 'tm-resize';
    resizeHandle.title = 'Kéo để đổi kích thước';
    resizeHandle.addEventListener('pointerdown', beginResize);

    panelEl.appendChild(dragBar);
    panelEl.appendChild(shellIframe);
    panelEl.appendChild(resizeHandle);

    toggleBtn = document.createElement('button');
    toggleBtn.className = 'tm-toggle';
    toggleBtn.type = 'button';
    toggleBtn.textContent = '›';
    toggleBtn.addEventListener('click', () => applyOpenState(!open));

    root.appendChild(panelEl);
    root.appendChild(toggleBtn);
    shadow.appendChild(style);
    shadow.appendChild(root);

    document.documentElement.appendChild(hostEl);

    if (globalThis.ThayMinhBridge) {
      ThayMinhBridge.setTargetFrame(shellIframe);
      ThayMinhBridge.start();
    }
    window.addEventListener('thay-minh-token-status', (ev) => {
      const has =
        ev && ev.detail && typeof ev.detail.hasToken === 'boolean'
          ? ev.detail.hasToken
          : false;
      setTokenBadge(has);
    });

    window.addEventListener('resize', () => {
      applyGeometry();
      schedulePersist();
    });

    applyGeometry();
  }

  function init() {
    buildUi();

    chrome.storage.sync.get(
      {
        sidebarOpen: true,
        widgetUrl: DEFAULT_WIDGET_URL,
        panelPosition: null,
        panelSize: null,
      },
      (result) => {
        if (result.panelSize && typeof result.panelSize === 'object') {
          size = clampSize({
            width: Number(result.panelSize.width) || DEFAULT_SIZE.width,
            height: Number(result.panelSize.height) || DEFAULT_SIZE.height,
          });
        }
        if (result.panelPosition && typeof result.panelPosition === 'object') {
          position = clampPosition(
            {
              left: Number(result.panelPosition.left),
              top: Number(result.panelPosition.top),
            },
            size
          );
        } else {
          position = defaultPosition();
        }
        applyOpenState(result.sidebarOpen !== false, false);
        void result.widgetUrl;
      }
    );

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.source !== BRIDGE_SOURCE) return;
      if (message.type === 'toggle-sidebar') {
        applyOpenState(!open);
        sendResponse({ ok: true, open });
        return true;
      }
      if (message.type === 'set-sidebar-open') {
        applyOpenState(!!message.open);
        sendResponse({ ok: true, open });
        return true;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
