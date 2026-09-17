import { useState } from 'react';
import { AiProviderFields } from '../../../shared/AiProviderFields';
import { readAISettings } from '../../../shared/ai-settings';

export function AiSettings() {
  const [settings, setSettings] = useState(readAISettings);
  function update(field: keyof typeof settings, value: string) {
    const keys = { provider: 'ai_provider', apiKey: 'ai_api_key', model: 'ai_model', baseUrl: 'ai_base_url' };
    localStorage.setItem(keys[field], value);
    setSettings(current => ({ ...current, [field]: value }));
  }
  return <details style={{ padding: 12 }}>
    <summary>Cấu hình AI — nhà cung cấp, key &amp; model</summary>
    <AiProviderFields provider={settings.provider} baseUrl={settings.baseUrl || ''} onProvider={v => update('provider', v)} onBaseUrl={v => update('baseUrl', v)} />
    <label style={{ display: 'grid', marginTop: 8 }}>API key
      <input type="password" autoComplete="off" value={settings.apiKey || ''} onChange={e => update('apiKey', e.target.value)} />
    </label>
    <label style={{ display: 'grid', marginTop: 8 }}>Mã model
      <input value={settings.model || ''} onChange={e => update('model', e.target.value)} placeholder="Mã model từ nhà cung cấp" />
    </label>
    <small>Cấu hình lưu trong trình duyệt này. Để trống để dùng cấu hình máy chủ.</small>
  </details>;
}
