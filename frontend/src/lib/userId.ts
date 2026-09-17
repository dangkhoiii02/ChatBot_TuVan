const STORAGE_KEY = 'chatbot_tuvan_x_user_id';

/** Phase 1: resolve staff id for X-User-Id (env → localStorage). */
export function getStaffUserId(): string {
  const fromEnv = (import.meta.env.VITE_DEV_USER_ID as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setStaffUserId(userId: string): void {
  const trimmed = userId.trim();
  try {
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export const STAFF_USER_ID_STORAGE_KEY = STORAGE_KEY;
