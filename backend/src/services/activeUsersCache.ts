type CacheEntry = {
  userIds: Set<string>;
  expiresAt: number;
};

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export const activeUsersCache = {
  get(pageId: string): Set<string> | undefined {
    const entry = cache.get(pageId);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      cache.delete(pageId);
      return undefined;
    }
    return entry.userIds;
  },

  set(pageId: string, userIds: Iterable<string>) {
    cache.set(pageId, {
      userIds: new Set(userIds),
      expiresAt: Date.now() + TTL_MS
    });
  }
};
