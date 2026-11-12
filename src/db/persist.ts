// Spec §4: ask the browser not to evict our IndexedDB data under storage pressure.

/**
 * Request persistent storage. Safe to call on every launch: it short-circuits once
 * granted. Never throws; returns whether storage is persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return false;
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false; // unsupported or denied — the app works either way
  }
}
