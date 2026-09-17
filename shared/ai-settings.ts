export function migrateAISettings() {
  for (const [oldKey, newKey] of [['gemini_api_key', 'ai_api_key'], ['gemini_model', 'ai_model']]) {
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, oldValue);
    localStorage.removeItem(oldKey);
  }
}
export function readAISettings() {
  migrateAISettings();
  const provider = localStorage.getItem('ai_provider') || 'auto';
  return {
    apiKey: localStorage.getItem('ai_api_key') || undefined,
    model: localStorage.getItem('ai_model') || undefined,
    provider,
    baseUrl: provider === 'custom' ? localStorage.getItem('ai_base_url') || undefined : undefined,
  };
}
