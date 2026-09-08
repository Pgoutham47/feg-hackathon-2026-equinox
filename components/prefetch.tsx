'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { recentPlays } from '@/lib/plays';

const CACHE = 'eog-assets-v1';
const READY = '/__eog-ready/';
/** How often the lobby re-reads which slices are resident. Cheap: a key scan, no network. */
const POLL_MS = 3_000;

type PrefetchApi = {
  /** Ask the worker to cache a game's slice now. Idempotent and cheap to spam. */
  request: (slug: string) => void;
  /** Slugs whose whole slice is cached. */
  ready: Set<string>;
};

const Ctx = createContext<PrefetchApi>({ request: () => {}, ready: new Set() });

export const usePrefetch = () => useContext(Ctx);

/** Never prefetch on a metered or slow link — there it competes with the load it is meant to help. */
function shouldPrefetch(): boolean {
  if (!('serviceWorker' in navigator)) return false;
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (conn?.saveData) return false;
  return !/^(slow-)?2g$/.test(conn?.effectiveType ?? '');
}

/** The worker writes one marker per fully cached game; reading them needs no worker at all. */
async function readySlugs(): Promise<string[]> {
  const keys = await (await caches.open(CACHE)).keys();
  return keys
    .map((request) => new URL(request.url).pathname)
    .filter((pathname) => pathname.startsWith(READY))
    .map((pathname) => pathname.slice(READY.length));
}

export function Prefetch({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState<Set<string>>(new Set());
  const worker = useRef<ServiceWorker | null>(null);

  /**
   * `controller` is null on the load that first registers the worker, so a page
   * that trusts it alone never sends anything until the next navigation. The
   * registration's own active worker is available immediately.
   */
  const post = useCallback((message: unknown) => {
    (navigator.serviceWorker?.controller ?? worker.current)?.postMessage(message);
  }, []);

  useEffect(() => {
    if (!shouldPrefetch()) return;
    let cancelled = false;

    const poll = setInterval(() => {
      void readySlugs().then((slugs) => {
        if (!cancelled) setReady((current) => (current.size === slugs.length ? current : new Set(slugs)));
      });
    }, POLL_MS);

    void (async () => {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (cancelled) return;
      worker.current = navigator.serviceWorker.controller ?? registration.active;
      // The worker owns the catalogue and the ranking; the page only tells it
      // what this device has played recently.
      post({ type: 'plan', recent: recentPlays() });
      setReady(new Set(await readySlugs()));
    })().catch(() => {
      // Prefetch is an optimisation; a failure here just means normal load times.
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [post]);

  const value = useMemo<PrefetchApi>(
    () => ({ ready, request: (slug) => post({ type: 'prefetch', slug }) }),
    [post, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
