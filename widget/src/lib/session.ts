const SESSION_KEY = 'chatbot_tuvan_app_session';

export type AppSession = {
  sessionToken: string;
  userId?: string;
  pageId?: string;
  expiresAt?: number;
};

export function getSessionToken(): string {
  return getAppSession()?.sessionToken?.trim() || '';
}

export function getAppSession(): AppSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppSession;
    if (!parsed?.sessionToken) return null;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      clearAppSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setAppSession(session: AppSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearAppSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
