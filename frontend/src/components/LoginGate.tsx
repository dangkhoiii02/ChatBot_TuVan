import React, { useState } from 'react';
import { loginWithPancakeAccessToken } from '../services/api';

type Props = {
  onLoggedIn: () => void;
};

export function LoginGate({ onLoggedIn }: Props) {
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const token = accessToken.trim();
    if (!token) {
      setError('Dán Pancake user access token để đăng nhập.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await loginWithPancakeAccessToken(token);
      setAccessToken('');
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-gate">
      <form className="login-card" onSubmit={submit}>
        <h1>Đăng nhập Copilot</h1>
        <p className="login-help">
          Phase 2a — dán <strong>Pancake user access token</strong>. Backend verify page +
          active_user_ids rồi cấp session app.
        </p>
        <label className="login-field">
          <span>Pancake access token</span>
          <textarea
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            rows={4}
            placeholder="eyJhbGciOi..."
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="btn-login" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
