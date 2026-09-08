'use client';

import { useEffect } from 'react';

import { recordPlay } from '@/lib/plays';

/**
 * Boots the certified game bundle in an iframe and logs time-to-Play-screen.
 *
 * The bundle is never modified — it posts its own `game:ready` message, and the
 * iframe load event is a comparable fallback where it does not.
 */
export function GameFrame({ slug, src }: { slug: string; src: string }) {
  useEffect(() => {
    const startedAt = performance.now();
    recordPlay(slug);

    const onMessage = (event: MessageEvent) => {
      // The bundle is served from the lobby's own origin so the worker can
      // control it; anything from elsewhere is not our game frame.
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type !== 'game:ready') return;
      console.info(
        `[eog] ${slug} time-to-Play-screen: ${Math.round(performance.now() - startedAt)}ms`,
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [slug]);

  return (
    <iframe
      title={slug}
      src={src}
      className="h-dvh w-dvw border-0"
      allow="autoplay; fullscreen"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
