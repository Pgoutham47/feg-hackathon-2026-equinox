import Link from 'next/link';

import type { Game } from '@/lib/catalogue';

/** Presentational only — every game boots the same bundle, so nothing here is per-game state. */
export function GameTile({ game }: { game: Game }) {
  return (
    <Link
      href={`/game/${game.slug}`}
      prefetch={false}
      className="group block overflow-hidden rounded-[var(--radius-tile)] border border-border bg-surface transition-transform active:scale-[0.98]"
    >
      <div
        className="flex aspect-[4/3] items-center justify-center"
        style={{
          backgroundImage: `linear-gradient(160deg, ${game.gradient.split(',').join(', ')})`,
        }}
      >
        <span className="text-5xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
          {game.symbol}
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        <p className="truncate text-xs text-muted">{game.provider}</p>
      </div>
    </Link>
  );
}
