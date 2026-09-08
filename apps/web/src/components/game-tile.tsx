'use client';

import Link from 'next/link';

import type { GameSummary } from '@eog/api-client';

import { usePrefetch } from '@/features/prefetch/prefetch-provider';
import { useTileTriggers } from '@/features/prefetch/use-tile-triggers';

export function GameTile({ game }: { game: GameSummary }) {
  const { ready } = usePrefetch();
  const triggers = useTileTriggers(game.slug);
  const isReady = ready.has(game.slug);

  return (
    <Link
      href={`/game/${game.slug}`}
      prefetch={false}
      {...triggers}
      className="group relative block overflow-hidden rounded-[var(--radius-tile)] border border-border bg-surface transition-transform active:scale-[0.98]"
      style={
        game.gradient
          ? { backgroundImage: `linear-gradient(160deg, ${game.gradient.split(',').join(', ')})` }
          : undefined
      }
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {game.thumbnailUrl ? (
          // A plain <img>, not next/image: these are already 320px WebP cut from
          // the game's own baked splash, served immutable from the CDN. Routing
          // them through the optimizer would re-encode work the baker already did.
          // eslint-disable-next-line @next/next/no-img-element -- see above
          <img
            src={game.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={320}
            height={320}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
        <span className="absolute left-3 top-2 text-3xl drop-shadow-lg">{game.symbol}</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{game.name}</p>
          <p className="truncate text-xs text-muted">{game.provider}</p>
        </div>
        {isReady && (
          <span
            className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold"
            title="Slice cached — opens instantly"
          >
            ⚡ READY
          </span>
        )}
      </div>
    </Link>
  );
}
