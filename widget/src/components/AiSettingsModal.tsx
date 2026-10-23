import { useState, useCallback, useEffect } from 'react';
import {
  readAISettings,
  saveAISettings,
  clearAIOverride,
  validateAISettings,
  type AISettingsMode
} from '../../../shared/ai-settings';
import { AiProviderFields } from '../../../shared/AiProviderFields';
import { validateAIConnection } from '../lib/api';

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

export function AiSettingsModal({ onClose, onSaved }: Props) {
  const [mode, setMode] = useState<AISettingsMode>('system');
  const [provider, setProvider] = useState('custom');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [rememberKey, setRememberKey] = useState(true);
  const [showKeySecret, setShowKeySecret] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const saved = readAISettings();
    setMode(saved.mode);
    setProvider(saved.provider && saved.provider !== 'auto' ? saved.provider : 'custom');
    setBaseUrl(saved.baseUrl || '');
    setApiKey(saved.apiKey || '');
    setModel(saved.model || '');
    setRememberKey(saved.rememberKey ?? true);
  }, []);

  const handleTestConnection = useCallback(async () => {
    const settings = {
      mode,
      provider,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      rememberKey
    };
    const errs = validateAISettings(settings);
    if (errs.length) {
      setErrors(errs);
      setConnectionStatus('');
      return;
    }
    setIsTesting(true);
    setErrors([]);
    setConnectionStatus('');
    try {
      const res = await validateAIConnection(settings);
      setConnectionStatus(`Kết nối thành công! Provider: ${res.provider} | Model: ${res.model}`);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Không kết nối được tới AI provider.']);
    } finally {
      setIsTesting(false);
    }
  }, [mode, provider, apiKey, model, baseUrl, rememberKey]);

  const handleSave = useCallback(() => {
    const settings = {
      mode,
      provider,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      rememberKey
    };
    const errs = validateAISettings(settings);
    if (errs.length) {
      setErrors(errs);
      return;
    }
    saveAISettings(settings);
    onSaved();
    onClose();
  }, [mode, provider, apiKey, model, baseUrl, rememberKey, onSaved, onClose]);

  const handleUseSystem = useCallback(() => {
    clearAIOverride();
    setMode('system');
    setProvider('custom');
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setErrors([]);
    setConnectionStatus('Đã chuyển về cấu hình hệ thống mặc định.');
    onSaved();
  }, [onSaved]);

  return (
    <dialog
      className="learning-dialog ai-settings-dialog"
      open
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 420,
        width: '94%',
        padding: 16,
        margin: 'auto'
      }}
    >
      <div className="learning-dialog-heading" style={{ marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Cấu hình AI &amp; Nhà cung cấp</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
            Điền URL API, Key và Model để gọi AI tùy chỉnh
          </p>
        </div>
        <button
          type="button"
          className="learning-dialog-close"
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, background: 'var(--bg)', padding: '8px 10px', borderRadius: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="radio"
              name="widget-ai-mode"
              checked={mode === 'system'}
              onChange={() => setMode('system')}
            />
            Mặc định hệ thống
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="radio"
              name="widget-ai-mode"
              checked={mode === 'user_override'}
              onChange={() => setMode('user_override')}
            />
            Cấu hình riêng (Custom)
          </label>
        </div>

        {mode === 'user_override' && (
          <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
            <AiProviderFields
              provider={provider}
              baseUrl={baseUrl}
              onProvider={setProvider}
              onBaseUrl={setBaseUrl}
            />

            <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
              <span>AI API Key</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showKeySecret ? 'text' : 'password'}
                  className="minimal-input"
                  style={{
                    flex: 1,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    padding: '6px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6
                  }}
                  placeholder="Dán API key (ví dụ: sk-...)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                />
                <button
                  type="button"
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#fff',
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowKeySecret((prev) => !prev)}
                >
                  {showKeySecret ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </label>

            <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
              <span>Tên Model (Mã model)</span>
              <input
                type="text"
                className="minimal-input"
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 6
                }}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ví dụ: ag/gemini-3.8-flash-high, gpt-4o, ..."
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberKey}
                onChange={(e) => setRememberKey(e.target.checked)}
              />
              <span>Ghi nhớ cấu hình trên thiết bị này</span>
            </label>
          </div>
        )}

        {errors.length > 0 && (
          <div className="learning-error" style={{ fontSize: 12, padding: '8px 10px', marginTop: 4 }}>
            <strong>Chưa thể lưu cấu hình:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {connectionStatus && (
          <div className="learning-notice" style={{ fontSize: 12, padding: '8px 10px', marginTop: 4 }}>
            {connectionStatus}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {mode === 'user_override' && (
          <button
            type="button"
            className="learning-text-button"
            style={{ marginRight: 'auto', fontSize: 11, color: '#dc2626' }}
            onClick={handleUseSystem}
          >
            Xóa cấu hình riêng
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          style={{ minHeight: 32, fontSize: 12, padding: '6px 10px' }}
          onClick={handleTestConnection}
          disabled={isTesting || mode === 'system'}
        >
          {isTesting ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ minHeight: 32, fontSize: 12, padding: '6px 10px' }}
          onClick={onClose}
        >
          Đóng
        </button>
        <button
          type="button"
          className="btn-primary-small"
          style={{ minHeight: 32, fontSize: 12, padding: '6px 12px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          onClick={handleSave}
        >
          Lưu cấu hình
        </button>
      </div>
    </dialog>
  );
}
