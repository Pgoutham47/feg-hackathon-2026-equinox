'use client';

import { useEffect, useState } from 'react';

const CACHE = 'eog-assets-v1';
const READY = '/__eog-ready';
/** How often to re-check whether the slice is resident. Cheap: a key scan, no network. */
const POLL_MS = 2_000;

/** Never prefetch on a metered or slow link — there it competes with the load it is meant to help. */
function shouldPrefetch(): boolean {
  if (!('serviceWorker' in navigator)) return false;
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (conn?.saveData) return false;
  return !/^(slow-)?2g$/.test(conn?.effectiveType ?? '');
}

/** The worker writes one marker when the slice is complete; reading it needs no worker at all. */
async function sliceIsReady(): Promise<boolean> {
  const keys = await (await caches.open(CACHE)).keys();
  return keys.some((request) => new URL(request.url).pathname === READY);
}

/**
 * Registers the worker, asks it to cache the Play-screen slice, and reports
 * when it is done. Every game boots the same bundle, so one slice makes the
 * whole catalogue instant — which is why this is a single line and not a badge
 * on each of thirty tiles.
 */
export function Prefetch({ gameCount }: { gameCount: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!shouldPrefetch()) return;
    let cancelled = false;

    const check = () =>
      void sliceIsReady().then((is) => {
        if (!cancelled && is) setReady(true);
      });
    const poll = setInterval(check, POLL_MS);

    void (async () => {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (cancelled) return;
      // `controller` is null on the load that first registers the worker, so a
      // page that trusts it alone never asks for anything until the next
      // navigation. The registration's own active worker is there immediately.
      (navigator.serviceWorker.controller ?? registration.active)?.postMessage({
        type: 'prefetch',
      });
      check();
    })().catch(() => {
      // Prefetch is an optimisation; a failure here just means normal load times.
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  return ready ? (
    <p className="text-sm font-medium text-gold">⚡ {gameCount} games ready — they open instantly</p>
  ) : (
    <p className="text-sm text-muted">Caching the Play screen…</p>
  );
}
