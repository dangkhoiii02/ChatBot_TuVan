/**
 * MAIN-world hook: capture Pancake user access_token from fetch/XHR/URL.
 * Posts to the content-script world via window.postMessage (hook source).
 * Never logs the raw token.
 */
(function () {
  'use strict';

  if (window.__thayMinhTokenHookInstalled) return;
  window.__thayMinhTokenHookInstalled = true;

  var HOOK_SOURCE = 'thay-minh-copilot-hook';
  var lastEmitted = '';

  function extractTokenFromUrl(url) {
    try {
      var u = new URL(String(url), location.href);
      return (
        u.searchParams.get('access_token') ||
        u.searchParams.get('accessToken') ||
        null
      );
    } catch (_) {
      var m = String(url || '').match(/[?&]access_token=([^&#]+)/i);
      if (!m) return null;
      try {
        return decodeURIComponent(m[1]);
      } catch (e) {
        return m[1];
      }
    }
  }

  function looksRelevant(url) {
    var s = String(url || '');
    if (/access_token=/i.test(s)) return true;
    return /pancake\.vn|pages\.fm|\/api\/v1\//i.test(s);
  }

  function readAuthHeader(headers) {
    if (!headers) return null;
    try {
      if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        return headers.get('Authorization') || headers.get('authorization');
      }
      if (Array.isArray(headers)) {
        for (var i = 0; i < headers.length; i++) {
          var pair = headers[i];
          if (
            pair &&
            String(pair[0]).toLowerCase() === 'authorization'
          ) {
            return pair[1];
          }
        }
        return null;
      }
      if (typeof headers === 'object') {
        return (
          headers.Authorization ||
          headers.authorization ||
          headers['Authorization'] ||
          headers['authorization'] ||
          null
        );
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function tokenFromAuth(value) {
    if (!value || typeof value !== 'string') return null;
    var m = value.match(/^\s*Bearer\s+(.+)\s*$/i);
    return m ? m[1].trim() : value.trim();
  }

  var STORAGE_KEY = 'thay-minh:pancakeAccessToken';

  function emitToken(token) {
    if (!token || typeof token !== 'string') return;
    var t = token.trim();
    if (t.length < 16) return;
    if (t === lastEmitted) return;
    lastEmitted = t;
    try {
      sessionStorage.setItem(STORAGE_KEY, t);
    } catch (_) {
      /* ignore */
    }
    try {
      window.postMessage(
        {
          source: HOOK_SOURCE,
          type: 'captured-access-token',
          accessToken: t,
        },
        '*'
      );
    } catch (_) {
      /* ignore */
    }
  }

  function considerUrl(url) {
    if (!url || !looksRelevant(url)) return;
    var fromUrl = extractTokenFromUrl(url);
    if (fromUrl) emitToken(fromUrl);
  }

  function considerInit(input, init) {
    try {
      var url =
        typeof input === 'string'
          ? input
          : input && typeof input.url === 'string'
            ? input.url
            : '';
      considerUrl(url);
      var headers =
        (init && init.headers) ||
        (input && typeof input.headers !== 'undefined' ? input.headers : null);
      var auth = tokenFromAuth(readAuthHeader(headers));
      if (auth && looksRelevant(url || location.href)) emitToken(auth);
    } catch (_) {
      /* ignore */
    }
  }

  // fetch
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      considerInit(input, init);
      return origFetch.apply(this, arguments);
    };
  }

  // XHR
  if (typeof XMLHttpRequest !== 'undefined') {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        this.__thayMinhUrl = url;
      } catch (_) {
        /* ignore */
      }
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try {
        if (String(name).toLowerCase() === 'authorization') {
          this.__thayMinhAuth = value;
        }
      } catch (_) {
        /* ignore */
      }
      return origSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      try {
        considerUrl(this.__thayMinhUrl);
        var auth = tokenFromAuth(this.__thayMinhAuth);
        if (auth) emitToken(auth);
      } catch (_) {
        /* ignore */
      }
      return origSend.apply(this, arguments);
    };
  }

  // Page URL (rare) + already-loaded resource timings
  try {
    considerUrl(location.href);
  } catch (_) {
    /* ignore */
  }
  try {
    var entries = performance.getEntriesByType('resource');
    for (var i = 0; i < entries.length; i++) {
      considerUrl(entries[i].name);
    }
  } catch (_) {
    /* ignore */
  }

  // Re-scan on SPA navigations / delayed network entries (F5 already covered by early hook + sessionStorage)
  function rescan() {
    try {
      considerUrl(location.href);
    } catch (_) {}
    try {
      var entries = performance.getEntriesByType('resource');
      for (var i = 0; i < entries.length; i++) {
        considerUrl(entries[i].name);
      }
    } catch (_) {}
  }
  window.addEventListener('hashchange', rescan);
  window.addEventListener('popstate', rescan);
  setInterval(rescan, 2000);

})();
