import type { LoadTier } from './types';

type LoadSample = {
  apiBaseUrl: string;
  deviceKey: string;
  gameSlug: string;
  timeToPlayScreenMs: number;
  tier: LoadTier;
  cacheHits?: number;
  cacheMisses?: number;
  prefetchedBytes?: number;
};

/**
 * sendBeacon so the sample survives the navigation into the game. Falls back to
 * keepalive fetch where beacon is unavailable; both are fire-and-forget because
 * a dropped sample must never cost the player a frame.
 */
export async function reportLoadSample({ apiBaseUrl, ...sample }: LoadSample): Promise<void> {
  const body = JSON.stringify({
    loads: [
      {
        deviceKey: sample.deviceKey,
        gameSlug: sample.gameSlug,
        timeToPlayScreenMs: sample.timeToPlayScreenMs,
        tier: sample.tier,
        cacheHits: sample.cacheHits ?? 0,
        cacheMisses: sample.cacheMisses ?? 0,
        prefetchedBytes: sample.prefetchedBytes ?? 0,
        effectiveConnectionType:
          (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
            ?.effectiveType ?? null,
      },
    ],
  });

  const url = `${apiBaseUrl}/v1/telemetry/batch`;
  const blob = new Blob([body], { type: 'application/json' });
  if (navigator.sendBeacon?.(url, blob)) return;
  await fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(
    () => undefined,
  );
}
