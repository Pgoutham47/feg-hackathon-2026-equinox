'use client';

import { useEffect, useRef } from 'react';

import type { SliceManifest } from '@eog/api-client';
import type { LoadTier } from '@eog/prefetch-core';
import { getDeviceKey, parseGameReady, reportLoadSample } from '@eog/prefetch-core';

import { publicEnv } from '@/env';

/**
 * Boots the certified game bundle in an iframe and records time-to-Play-screen.
 *
 * The bundle is never modified — it posts its own `game:ready` message, and if
 * it does not, the fallback below still gives a comparable number from the
 * iframe load event.
 */
export function GameFrame({ manifest }: { manifest: SliceManifest }) {
  const startedAt = useRef(performance.now());
  const reported = useRef(false);

  useEffect(() => {
    const report = (tier: LoadTier) => {
      if (reported.current) return;
      reported.current = true;
      void reportLoadSample({
        apiBaseUrl: publicEnv.NEXT_PUBLIC_API_BASE_URL,
        deviceKey: getDeviceKey(),
        gameSlug: manifest.gameSlug,
        timeToPlayScreenMs: Math.round(performance.now() - startedAt.current),
        tier,
      });
    };

    const onMessage = (e: MessageEvent) => {
      // The bundle is served from the lobby's own origin so the worker can
      // control it; anything from elsewhere is not our game frame.
      if (e.origin !== window.location.origin) return;
      const ready = parseGameReady(e.data);
      if (ready) report(ready.tier);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [manifest.gameSlug]);

  const src = `${publicEnv.NEXT_PUBLIC_CDN_BASE_URL}/${manifest.gameSlug}/${manifest.bundleVersion}/index.html`;

  return (
    <iframe
      title={manifest.gameSlug}
      src={src}
      className="h-dvh w-dvw border-0"
      allow="autoplay; fullscreen"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
