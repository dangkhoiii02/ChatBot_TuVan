export type AISettingsMode = 'system' | 'user_override';

export type AISettings = {
  mode: AISettingsMode;
  provider: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  rememberKey: boolean;
};

const KEYS = {
  mode: 'ai_settings_mode',
  provider: 'ai_provider',
  apiKey: 'ai_api_key',
  model: 'ai_model',
  baseUrl: 'ai_base_url',
  rememberKey: 'ai_remember_key'
} as const;

export function migrateAISettings() {
  for (const [oldKey, newKey] of [
    ['gemini_api_key', KEYS.apiKey],
    ['gemini_model', KEYS.model]
  ]) {
    const oldValue = safeGet(localStorage, oldKey);
    if (oldValue && safeGet(localStorage, newKey) === null) safeSet(localStorage, newKey, oldValue);
    safeRemove(localStorage, oldKey);
  }

  const hasLegacyOverride = Boolean(
    safeGet(localStorage, KEYS.apiKey) ||
      safeGet(localStorage, KEYS.model) ||
      (safeGet(localStorage, KEYS.provider) && safeGet(localStorage, KEYS.provider) !== 'auto')
  );
  if (safeGet(localStorage, KEYS.mode) === null) {
    safeSet(localStorage, KEYS.mode, hasLegacyOverride ? 'user_override' : 'system');
  }
  if (hasLegacyOverride && safeGet(localStorage, KEYS.rememberKey) === null) {
    safeSet(localStorage, KEYS.rememberKey, '1');
  }
}

export function readAISettings(): AISettings {
  migrateAISettings();
  const mode = safeGet(localStorage, KEYS.mode) === 'user_override' ? 'user_override' : 'system';
  const rememberKey = safeGet(localStorage, KEYS.rememberKey) === '1';
  const provider = safeGet(localStorage, KEYS.provider) || 'auto';
  const storedKey = rememberKey
    ? safeGet(localStorage, KEYS.apiKey)
    : safeGet(sessionStorage, KEYS.apiKey);

  return {
    mode,
    provider,
    apiKey: storedKey || undefined,
    model: safeGet(localStorage, KEYS.model) || undefined,
    baseUrl: provider === 'custom' ? safeGet(localStorage, KEYS.baseUrl) || undefined : undefined,
    rememberKey
  };
}

export function saveAISettings(settings: AISettings) {
  safeSet(localStorage, KEYS.mode, settings.mode);
  safeSet(localStorage, KEYS.provider, settings.provider || 'auto');
  writeOptional(localStorage, KEYS.model, settings.model);
  writeOptional(localStorage, KEYS.baseUrl, settings.baseUrl);
  safeSet(localStorage, KEYS.rememberKey, settings.rememberKey ? '1' : '0');

  safeRemove(localStorage, KEYS.apiKey);
  safeRemove(sessionStorage, KEYS.apiKey);
  if (settings.mode === 'user_override' && settings.apiKey?.trim()) {
    safeSet(settings.rememberKey ? localStorage : sessionStorage, KEYS.apiKey, settings.apiKey.trim());
  }
}

export function clearAIOverride() {
  safeSet(localStorage, KEYS.mode, 'system');
  safeRemove(localStorage, KEYS.apiKey);
  safeRemove(sessionStorage, KEYS.apiKey);
  safeRemove(localStorage, KEYS.model);
  safeRemove(localStorage, KEYS.baseUrl);
  safeSet(localStorage, KEYS.provider, 'auto');
  safeSet(localStorage, KEYS.rememberKey, '0');
}

export function clearSessionAIKey() {
  safeRemove(sessionStorage, KEYS.apiKey);
}

export function validateAISettings(settings: AISettings): string[] {
  if (settings.mode === 'system') return [];
  const errors: string[] = [];
  if (!settings.apiKey?.trim() && settings.provider !== 'mock') errors.push('Vui lòng nhập API key.');
  if (!settings.model?.trim() && settings.provider !== 'mock') errors.push('Vui lòng nhập mã model.');
  if (settings.provider === 'custom') {
    if (!settings.baseUrl?.trim()) {
      errors.push('Vui lòng nhập Base URL HTTPS.');
    } else {
      try {
        const url = new URL(settings.baseUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
          errors.push('Base URL phải là HTTPS và không chứa tài khoản, query hoặc fragment.');
        }
      } catch {
        errors.push('Base URL không hợp lệ.');
      }
    }
  }
  return errors;
}

export function getAIRequestOverride(settings = readAISettings()) {
  if (settings.mode === 'system') return {};
  return {
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl: settings.provider === 'custom' ? settings.baseUrl : undefined
  };
}

function writeOptional(storage: Storage, key: string, value?: string) {
  const normalized = value?.trim();
  if (normalized) safeSet(storage, key, normalized);
  else safeRemove(storage, key);
}

function safeGet(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Browser policy may disable storage. React state still works for the current view.
  }
}

function safeRemove(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}
