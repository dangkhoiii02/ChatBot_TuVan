/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Phase 1 temporary staff UUID for X-User-Id */
  readonly VITE_DEV_USER_ID?: string;
  /** Show phase-1 User ID field + send X-User-Id when no session */
  readonly VITE_ALLOW_DEV_USER_HEADER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
