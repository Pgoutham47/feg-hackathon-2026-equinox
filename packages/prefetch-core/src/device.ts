const KEY = 'eog.device';

/**
 * A random, per-browser id used only to personalise the prefetch ranking.
 * Not an account, not linkable to a person, and never sent anywhere but our own
 * telemetry endpoint — so the lobby needs no consent gate for it.
 */
export function getDeviceKey(): string {
  if (typeof localStorage === 'undefined') return 'anonymous000000';
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage blocked: fall back to a session-scoped id.
    return 'ephemeral000000';
  }
}
