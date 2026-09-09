'use client';

import { useEffect, useRef, useState } from 'react';

import { ASSET_CACHE, ORIGINAL_PREFIX } from '@/lib/copies';

/** How long the game has to ask for nothing before it counts as loaded. */
const QUIET_MS = 700;
/** Give up waiting for quiet rather than counting forever on a broken load. */
const CEILING_MS = 60_000;
const POLL_MS = 100;

export type LoadResult = {
  /** Milliseconds from mount to the last asset request. */
  ms: number;
  /** Assets the game actually got. */
  requested: number;
  /** Of those, how many were not already in Cache Storage when it started. */
  downloaded: number;
};

/**
 * Times how long a game in an iframe takes to finish loading, and how much of
 * it came off the network.
 *
 * 'Loaded' is when the bundle stops asking for things, not when the iframe
 * fires `load` — that fires as soon as the document and its scripts are in,
 * while a Pixi game is still pulling spines and sound for a good while after.
 * Waiting for the network to go quiet is the closest honest stand-in for 'the
 * player can see the game', given the bundle reports nothing itself.
 *
 * The downloaded count is measured against a snapshot of Cache Storage taken
 * before the game boots, not from `transferSize`. A service worker makes
 * `transferSize` 0 for everything it serves, whether or not it went to the
 * network, so the obvious measurement would report every game as fully cached.
 *
 * Only responses that carried an asset are counted. This bundle asks for one
 * file it does not ship — `spines/@1x/book.png`, see the README — and a 404 is
 * a round trip that delivers nothing. Counting it would have every fully-cached
 * game report '1 downloaded' and never 'all from cache', which says something
 * false about the cache to avoid saying something false about the network.
 *
 * One definition, one implementation: the badge over a game and the Compare
 * panel both read from here, so the two can never quote different numbers for
 * the same load.
 */
export function useFrameLoad(
  frame: React.RefObject<HTMLIFrameElement | null>,
  { enabled = true, runId = 0 }: { enabled?: boolean; runId?: number } = {},
): { elapsed: number; result: LoadResult | null } {
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  // Written by the effect and read on the tick it settles, so it has to be a
  // ref: state would not be visible until the next render.
  const cached = useRef<Set<string> | null>(null);

  // Cleared per run, not per enable. A finished side has to keep showing its
  // number while the other one is still going, so the reset cannot hang off
  // `enabled` — it hangs off the run the caller says it is on.
  useEffect(() => {
    setResult(null);
    setElapsed(0);
  }, [runId]);

  useEffect(() => {
    if (!enabled) return;

    const startedAt = performance.now();
    let done = false;

    // Snapshot first. Anything requested later that is not in here came off the
    // network, however the browser reports its transfer size.
    void caches
      .open(ASSET_CACHE)
      .then((cache) => cache.keys())
      .then((keys) => {
        cached.current = new Set(keys.map((request) => new URL(request.url).pathname));
      })
      .catch(() => {
        cached.current = new Set();
      });

    let lastSeen = performance.now();
    let lastCount = 0;

    const timer = setInterval(() => {
      const now = performance.now();
      if (!done) setElapsed(now - startedAt);

      let entries: PerformanceResourceTiming[] = [];
      try {
        const view = frame.current?.contentWindow;
        const all = (view?.performance.getEntriesByType('resource') ??
          []) as PerformanceResourceTiming[];
        entries = all.filter((entry) => {
          // Both the cached path and the Compare panel's uncached baseline.
          const { pathname } = new URL(entry.name);
          if (!pathname.startsWith('/cdn/') && !pathname.startsWith(`${ORIGINAL_PREFIX}/`)) {
            return false;
          }
          // `responseStatus` is 0 where the browser will not report one; only a
          // status it does report, and that failed, is excluded.
          const status = entry.responseStatus;
          return !status || status < 400;
        });
      } catch {
        // Cross-origin at some point in the future: fall back to the elapsed
        // clock alone rather than reporting a number we cannot stand behind.
        return;
      }

      if (entries.length !== lastCount) {
        lastCount = entries.length;
        lastSeen = now;
        return;
      }

      const quiet = now - lastSeen > QUIET_MS;
      const stalled = now - startedAt > CEILING_MS;
      if (done || lastCount === 0 || (!quiet && !stalled)) return;

      done = true;
      clearInterval(timer);
      const before = cached.current;
      const downloaded = before
        ? entries.filter((entry) => !before.has(new URL(entry.name).pathname)).length
        : 0;
      // The wait for quiet is bookkeeping, not load time — take it back off.
      setResult({ ms: lastSeen - startedAt, requested: entries.length, downloaded });
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [frame, enabled, runId]);

  return { elapsed, result };
}
