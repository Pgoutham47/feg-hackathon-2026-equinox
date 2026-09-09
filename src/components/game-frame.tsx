'use client';

import { useEffect, useRef } from 'react';

import { LoadTimer } from '@/components/load-timer';
import { recordPlay } from '@/lib/recent';

/**
 * How long a player has to stay before the open counts.
 *
 * The lobby spends 38.8 MB on somebody who has opened two games, so a mis-tap
 * that backs straight out must not be one of them. Waiting is the only way to
 * tell the difference: the bundle reports nothing, so there is no 'reached the
 * Play screen' signal to gate on, and the alternative — counting the tile tap
 * itself — counts a player who never saw the game.
 *
 * Five seconds errs on the long side deliberately. Missing a real player is
 * cheap, since they simply qualify on their next visit; counting a mis-tap
 * costs the full download.
 */
const DWELL_MS = 5_000;

/**
 * Boots the certified game bundle in an iframe, and records the open once the
 * player has stayed long enough for it to mean something.
 *
 * The bundle is never modified. It does not post `game:ready` — nothing in
 * `public/bundle` sends a message to the parent frame at all, so the listener
 * below has never fired and the timing it logs has never been recorded. It is
 * kept because it costs nothing and is the shape a future bundle would use, but
 * nothing may be built on top of it until a bundle actually posts one.
 */
export function GameFrame({ slug, src }: { slug: string; src: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  // Still recorded, though the demo's pinned favourites do not read it: this is
  // the real signal, and keeping it fed means switching `favouriteSlugs()` back
  // is the only change needed. Cleanup cancels it, so leaving early records nothing.
  useEffect(() => {
    const timer = setTimeout(() => recordPlay(slug), DWELL_MS);
    return () => clearTimeout(timer);
  }, [slug]);

  useEffect(() => {
    const startedAt = performance.now();

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
    <>
      <LoadTimer frame={frame} />
      <iframe
        ref={frame}
        title={slug}
        src={src}
        className="h-dvh w-dvw border-0"
        allow="autoplay; fullscreen"
        sandbox="allow-scripts allow-same-origin"
      />
    </>
  );
}
