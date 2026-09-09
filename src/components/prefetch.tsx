'use client';

import { useEffect, useState } from 'react';

import { detectAudioFormat } from '@/lib/audio';
import { type AssetTier, type AudioFormat } from '@/lib/catalogue';
import {
  ASSET_CACHE,
  favouriteSlugs,
  fullCopies,
  SHARED_COPY,
  warmedSlugs,
  type Copy,
} from '@/lib/copies';
import { detectTier } from '@/lib/tier';

const READY = '/__eog-ready';
const FULL = '/__eog-full';
/**
 * Which copies get the full 38.8 MB: the ones holding a favourite.
 *
 * For the demo that is both of them, on every visit, because the favourites are
 * pinned — there is no history to build up first. The real version gates this
 * on the player having opened games, since event logs from 89 players put a
 * cold visitor's chance of opening anything at 4.5% against a regular's 46.7%,
 * and the full set is not worth spending on the first group.
 */
/** How often to re-check whether the slice is resident. Cheap: a key scan, no network. */
const POLL_MS = 2_000;

/**
 * Never prefetch on a metered or slow link — there it competes with the load it
 * is meant to help.
 *
 * This deliberately does not consult `navigator.connection.downlink`. Measured
 * against a link carrying 31-55 Mbps, Chrome reported 1.55 and never moved off
 * it across three multi-megabyte downloads — a 35x underestimate that would
 * have switched the prefetch off for players whose connection is fine. It is a
 * smoothed, quantised estimate of observed throughput, so on any link where
 * latency dominates small requests it reads far below capacity. The worker
 * measures the real thing instead, once it has bytes to measure.
 */
function shouldPrefetch(): boolean {
  if (!('serviceWorker' in navigator)) return false;
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (conn?.saveData) return false;
  return !/^(slow-)?2g$/.test(conn?.effectiveType ?? '');
}

/**
 * The worker writes a marker when a phase is complete; reading one needs no
 * worker at all. Markers name the variant they vouch for, so a cache warmed on
 * a desktop does not read as ready on a phone — they hold different files.
 *
 * One key scan answers both phases, which is what keeps the poll cheap.
 */
async function phasesDone(
  tier: AssetTier,
  format: AudioFormat,
  wanted: Copy[],
): Promise<{ slice: boolean; full: number }> {
  const keys = await (await caches.open(ASSET_CACHE)).keys();
  const urls = keys.map((request) => new URL(request.url));
  const marks = (path: string, copy: Copy) =>
    urls.some(
      (url) =>
        url.pathname === path &&
        url.searchParams.get('tier') === tier &&
        url.searchParams.get('copy') === copy &&
        (path === READY || url.searchParams.get('fmt') === format),
    );
  return {
    // The shared copy is what the rest of the catalogue boots from, so it is
    // what 'the lobby is ready' means.
    slice: marks(READY, SHARED_COPY),
    full: wanted.filter((copy) => marks(FULL, copy)).length,
  };
}

/**
 * Registers the worker, asks it to cache the Play-screen slice, and reports
 * when it is done. Every game boots the same bundle, so one slice makes the
 * whole catalogue instant — which is why this is a single line and not a badge
 * on each of thirty tiles.
 */
export function Prefetch({ gameCount }: { gameCount: number }) {
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(0);
  // Only promise favourites to a player who has some, so the 'caching' line
  // does not sit there unresolved for everybody else.
  const [wanted, setWanted] = useState(0);

  useEffect(() => {
    if (!shouldPrefetch()) return;
    let cancelled = false;
    const tier = detectTier();
    const format = detectAudioFormat();
    const copies = fullCopies(favouriteSlugs().length);
    setWanted(copies.length);

    const check = () =>
      void phasesDone(tier, format, copies).then((done) => {
        if (cancelled) return;
        if (done.slice) setReady(true);
        setFull(done.full);
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
        tier,
        format,
        fullCopies: copies,
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

  if (!ready) return <p className="text-sm text-muted">Caching the Play screen…</p>;

  return (
    <p className="text-sm font-medium text-gold">
      ⚡ {gameCount} games ready — they open instantly
      {wanted > 0 ? (
        <span className="font-normal text-muted">
          {' · '}
          {/* Games, not copies. Two copies are warmed, but six games are served
              from them — and the count a player would care about is the second
              one. */}
          {full === wanted
            ? `${warmedSlugs().length} fully cached, nothing left to load`
            : `warming ${warmedSlugs().length} games…`}
        </span>
      ) : null}
    </p>
  );
}
