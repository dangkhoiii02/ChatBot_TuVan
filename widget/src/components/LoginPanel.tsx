import { FormEvent, useState } from 'react';
import { loginWithPancakeAccessToken } from '../lib/api';

type Props = {
  bridgeToken?: string | null;
  onLoggedIn: () => void;
};

export function LoginPanel({ bridgeToken, onLoggedIn }: Props) {
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event?: FormEvent, tokenOverride?: string) => {
    event?.preventDefault();
    const token = (tokenOverride ?? accessToken).trim();
    if (!token) {
      setError('Cần Pancake access token (từ extension hoặc dán tay).');
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
    <form className="login-panel" onSubmit={(e) => submit(e)}>
      <div className="login-panel-title">Đăng nhập</div>
      <p className="login-panel-help">
        Ưu tiên token từ extension. Nếu chưa bắt được, dán Pancake user access token.
      </p>
      {bridgeToken ? (
        <button
          type="button"
          className="btn-login-bridge"
          disabled={busy}
          onClick={() => submit(undefined, bridgeToken)}
        >
          {busy ? 'Đang login…' : 'Login bằng token extension'}
        </button>
      ) : (
        <div className="login-panel-hint">Chưa nhận token từ extension — dùng paste.</div>
      )}
      <label className="login-panel-field">
        <span>Pancake access token</span>
        <textarea
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          rows={3}
          placeholder="eyJhbGciOi..."
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      {error && <div className="login-panel-error">{error}</div>}
      <button type="submit" className="btn-login" disabled={busy}>
        {busy ? 'Đang login…' : 'Đăng nhập (paste)'}
      </button>
    </form>
  );
}
