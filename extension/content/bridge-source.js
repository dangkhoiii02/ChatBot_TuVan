/**
 * Mirrors ChatBot_TuVan/shared/bridge.ts — keep in sync with Dev 1.
 * Content scripts cannot import .ts; this is the JS mirror of BRIDGE_SOURCE.
 */
(function (global) {
  'use strict';
  global.ThayMinhBridgeContract = {
    BRIDGE_SOURCE: 'thay-minh-copilot',
    BRIDGE_VERSION: 1,
  };
})(typeof window !== 'undefined' ? window : globalThis);
