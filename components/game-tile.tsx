'use client';

import Link from 'next/link';
import { useCallback, useRef } from 'react';

import { usePrefetch } from '@/components/prefetch';
import { type Game, thumbnailUrl } from '@/lib/catalogue';

/** 500 ms of hover or scroll-rest: long enough not to spend bytes on a scroll-past. */
const DWELL_MS = 500;

export function GameTile({ game }: { game: Game }) {
  const { ready, request } = usePrefetch();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  return (
    <Link
      href={`/game/${game.slug}`}
      prefetch={false}
      onPointerEnter={() => {
        clear();
        timer.current = setTimeout(() => request(game.slug), DWELL_MS);
      }}
      onPointerLeave={clear}
      // pointerdown fires ~80-120 ms before the tap registers as a click.
      onPointerDown={() => {
        clear();
        request(game.slug);
      }}
      className="group relative block overflow-hidden rounded-[var(--radius-tile)] border border-border bg-surface transition-transform active:scale-[0.98]"
      style={{ backgroundImage: `linear-gradient(160deg, ${game.gradient.split(',').join(', ')})` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* A plain <img>: these are 320px WebP already cut from the game's own
            baked splash and served immutable, so the optimizer would only redo
            work the bake already did. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl(game)}
          alt=""
          loading="lazy"
          decoding="async"
          width={320}
          height={320}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-3 top-2 text-3xl drop-shadow-lg">{game.symbol}</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{game.name}</p>
          <p className="truncate text-xs text-muted">{game.provider}</p>
        </div>
        {ready.has(game.slug) && (
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
