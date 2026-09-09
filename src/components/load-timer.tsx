'use client';

import { useFrameLoad } from '@/lib/use-frame-load';

/**
 * Reports how long the game took to open, and how much of it came off the disk.
 *
 * Stays for as long as the game is on screen rather than fading like a toast:
 * it is the readout the caching work exists to show, and a number that has
 * already gone by the time anyone looks at the screen is no readout at all.
 * `pointer-events-none` keeps it off the game's input path regardless.
 */
export function LoadTimer({ frame }: { frame: React.RefObject<HTMLIFrameElement | null> }) {
  const { elapsed, result } = useFrameLoad(frame);
  const seconds = ((result?.ms ?? elapsed) / 1000).toFixed(2);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
      <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-black/70 py-1.5 pr-4 pl-3 text-white shadow-lg backdrop-blur-md">
        {result ? (
          <span className="text-sm text-gold">⚡</span>
        ) : (
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
        )}
        <span className="text-sm font-semibold tabular-nums">
          {result ? `Loaded in ${seconds}s` : `Loading… ${seconds}s`}
        </span>
        {result ? (
          <span className="border-l border-white/20 pl-2.5 text-xs text-white/70 tabular-nums">
            {result.requested} files ·{' '}
            {result.downloaded === 0 ? (
              <span className="font-medium text-gold">all from cache</span>
            ) : (
              `${result.downloaded} downloaded`
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
