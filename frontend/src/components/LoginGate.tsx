import React, { useState } from 'react';
import { loginWithPancakeAccessToken } from '../services/api';

type Props = {
  onLoggedIn: () => void;
  notice?: string;
};

export function LoginGate({ onLoggedIn, notice }: Props) {
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const login = async (token: string) => {
    setBusy(true);
    setError('');
    try {
      await loginWithPancakeAccessToken(token);
      setAccessToken('');
      onLoggedIn();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Đăng nhập thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const submitPancake = (event: React.FormEvent) => {
    event.preventDefault();
    const token = accessToken.trim();
    if (!token) {
      setError('Vui lòng dán Pancake user access token để đăng nhập.');
      return;
    }
    void login(token);
  };

  return (
    <div className="login-gate">
      <div className="login-card login-card-v2">
        <div className="login-header">
          <div className="login-brand-icon" aria-hidden>🎹</div>
          <div className="login-brand-text">
            <h1 className="login-title">Lớp Nhạc Thầy Minh</h1>
            <p className="login-subtitle">AI Copilot hỗ trợ phản hồi học viên trên Pancake</p>
          </div>
        </div>

        {(error || notice) && <div className="login-error-banner" role="alert">⚠️ {error || notice}</div>}

        <form className="pancake-login-form" onSubmit={submitPancake}>
          <label className="login-field">
            <span className="field-title">Pancake User Access Token</span>
            <textarea
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              rows={3}
              placeholder="Dán access token được cấp cho tài khoản vận hành"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <button type="submit" className="btn-login-pancake" disabled={busy}>
            {busy ? 'Đang xác thực…' : 'Đăng nhập Pancake'}
          </button>
        </form>

      </div>
    </div>
  );
}
