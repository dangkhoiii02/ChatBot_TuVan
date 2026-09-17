import { AiProviderFields } from '../../../shared/AiProviderFields';
import { migrateAISettings } from '../../../shared/ai-settings';
migrateAISettings();
import React, { useState } from 'react';
import { loginWithPancakeAccessToken } from '../services/api';

type Props = {
  onLoggedIn: () => void;
};

export function LoginGate({ onLoggedIn }: Props) {
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // AI API Key & Model direct setup
  const [aiApiKey, setAiApiKey] = useState<string>(() => localStorage.getItem('ai_api_key') || '');
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('ai_provider') || 'auto');
  const [aiBaseUrl, setAiBaseUrl] = useState(() => localStorage.getItem('ai_base_url') || '');
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem('ai_model') || '');
  const [showKeySecret, setShowKeySecret] = useState(false);
  const [showPancakeLogin, setShowPancakeLogin] = useState(false);

  const handleKeyChange = (val: string) => {
    setAiApiKey(val);
    if (val.trim()) {
      localStorage.setItem('ai_api_key', val.trim());
    } else {
      localStorage.removeItem('ai_api_key');
    }
  };

  const handleModelChange = (val: string) => {
    setAiModel(val);
    localStorage.setItem('ai_model', val);
  };

  const handleQuickDemoLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await loginWithPancakeAccessToken('demo');
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập demo thất bại');
    } finally {
      setBusy(false);
    }
  };

  const submitPancake = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const token = accessToken.trim();
    if (!token) {
      setError('Vui lòng dán Pancake user access token để đăng nhập.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await loginWithPancakeAccessToken(token);
      setAccessToken('');
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-gate">
      <div className="login-card login-card-v2">
        {/* BRAND HEADER */}
        <div className="login-header">
          <div className="login-brand-icon">🎹</div>
          <div className="login-brand-text">
            <h1 className="login-title">Lớp Nhạc Thầy Minh</h1>
            <p className="login-subtitle">AI Copilot Hỗ trợ phản hồi &amp; Tư vấn học viên Pancake</p>
          </div>
        </div>

        {error && <div className="login-error-banner">⚠️ {error}</div>}

        {/* 1. SECTION: CHẾ ĐỘ THỬ NGHIỆM NHANH (DEMO MODE) */}
        <div className="login-demo-section">
          <div className="section-badge-row">
            <span className="badge-demo-highlight">⚡ Khuyến nghị để kiểm thử</span>
            <span className="badge-live-tag">6 Học viên • 3 Cờ • 3 Giọng điệu</span>
          </div>

          <p className="demo-description">
            Vào ngay môi trường giả lập đầy đủ kịch bản tư vấn học đàn, chấm bài tập, xử lý học viên bận/cờ đỏ mà không cần cấu hình Pancake.
          </p>

          {/* AI KEY & MODEL CONFIGURATION CARD */}
          <div className="login-ai-box">
            <div className="ai-box-header">
              <span className="ai-box-title">🤖 Cấu hình AI &amp; Mô hình</span>
              {aiApiKey.trim() ? (
                <span className="ai-status-active">✓ Đã nhận Key</span>
              ) : (
                <span className="ai-status-mock">Đang dùng Mock Engine</span>
              )}
            </div>

            <div className="ai-box-fields"><AiProviderFields provider={aiProvider} baseUrl={aiBaseUrl} onProvider={v => { setAiProvider(v); localStorage.setItem('ai_provider', v); }} onBaseUrl={v => { setAiBaseUrl(v); localStorage.setItem('ai_base_url', v); }} />

              <div className="ai-field-row">
                <label className="ai-field-label" htmlFor="login-ai-key">API Key:</label>
                <div className="ai-input-wrap">
                  <input
                    id="login-ai-key" type={showKeySecret ? 'text' : 'password'}
                    className="ai-key-input"
                    placeholder="Dán API key của nhà cung cấp..."
                    value={aiApiKey}
                    onChange={(e) => handleKeyChange(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="btn-toggle-secret"
                    onClick={() => setShowKeySecret(!showKeySecret)}
                  >
                    {showKeySecret ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>

              <div className="ai-field-row">
                <label className="ai-field-label" htmlFor="login-ai-model">Mô hình AI:</label>
                <input id="login-ai-model" aria-label="Mã model AI" className="minimal-input ai-key-input" value={aiModel} onChange={(e) => handleModelChange(e.target.value)} placeholder="Nhập mã model chính xác" />
              </div>

              <p className="ai-note-text">
                {aiApiKey.trim()
                  ? `🚀 AI sẽ gọi trực tiếp mô hình ${aiModel} để sinh gợi ý theo ngữ cảnh thực.`
                  : '💡 Chưa có Key? Đừng lo! Hệ thống sẽ dùng Knowledge Engine chuẩn Thầy Minh với đầy đủ 3 phương án gợi ý.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-primary-demo-launch"
            onClick={handleQuickDemoLogin}
            disabled={busy}
          >
            {busy ? 'Đang khởi động...' : '🚀 Bắt đầu Trải nghiệm Ngay'}
          </button>
        </div>

        {/* 2. SECTION: PANCAKE TOKEN LOGIN (COLLAPSIBLE) */}
        <div className="login-pancake-divider">
          <span>HOẶC KẾT NỐI PANCAKE LIVE</span>
        </div>

        {!showPancakeLogin ? (
          <button
            type="button"
            className="btn-toggle-pancake"
            onClick={() => setShowPancakeLogin(true)}
          >
            🔗 Đăng nhập bằng Pancake Access Token thật
          </button>
        ) : (
          <form className="pancake-login-form" onSubmit={submitPancake}>
            <label className="login-field">
              <span className="field-title">Pancake User Access Token</span>
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                rows={3}
                placeholder="Dán mã accessToken từ Pancake Web (eyJhbGciOi...)"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <div className="pancake-form-actions">
              <button
                type="button"
                className="btn-cancel-pancake"
                onClick={() => setShowPancakeLogin(false)}
              >
                Thu gọn
              </button>
              <button type="submit" className="btn-login-pancake" disabled={busy}>
                {busy ? 'Đang xác thực...' : 'Đăng nhập Pancake'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
