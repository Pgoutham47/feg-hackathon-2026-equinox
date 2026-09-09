/**
 * The games this player has recently opened.
 *
 * This exists to answer one question on the lobby: is this player worth a full
 * precache? The full set is 38.8 MB on top of the 17.5 MB slice and audio, so
 * it is only worth spending on somebody who will actually open a game.
 *
 * Event logs from 89 players over 13,682 launches say that is highly
 * predictable from exactly this signal. On casino surfaces, the share of
 * sessions that open any game runs:
 *
 *   no history      4.5%
 *   1-2 sessions   11.4%
 *   3-9 sessions   19.1%
 *   10+ sessions   46.7%
 *
 * — a 10x spread between a first-time visitor and a returning player. And a
 * session that opens one game opens 5.3 on average, so the cache is not warmed
 * for a single boot. Spending the full set on everyone would hand 38.8 MB to
 * the 95.5% of cold visitors who never launch anything.
 */
const KEY = 'eog-recent-v1';
/** Enough to answer the gate and to rank by recency later; not a play history. */
const CAP = 20;
/**
 * 'Recently' has to mean something, or a player who opened two games once last
 * year reads the same as a regular. Thirty days is well past the point where a
 * bundle version bump would have emptied the cache anyway.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type RecentGame = { slug: string; at: number };

/**
 * Storage throws rather than returning null in a few real configurations —
 * Safari's private mode historically, and any browser set to block site data.
 * A player whose storage is unreadable simply reads as cold, which is the
 * conservative direction: they keep today's slice-and-audio prefetch.
 */
function read(): RecentGame[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter(
      (entry): entry is RecentGame =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentGame).slug === 'string' &&
        typeof (entry as RecentGame).at === 'number' &&
        (entry as RecentGame).at > cutoff,
    );
  } catch {
    return [];
  }
}

/** Most recent first, one entry per game. */
export function recentGames(): RecentGame[] {
  return read();
}

/** Records an open. Re-opening a game moves it to the front rather than adding a duplicate. */
export function recordPlay(slug: string): void {
  try {
    const next = [{ slug, at: Date.now() }, ...read().filter((game) => game.slug !== slug)];
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, CAP)));
  } catch {
    // Nothing here is worth breaking a game launch over.
  }
}
