'use client';

import Link from 'next/link';

import type { Game } from '@/lib/catalogue';
import { useAccount } from '@/lib/account';
import { metaFor } from '@/lib/demo-data';

/** Presentational only — every game boots the same bundle, so nothing here is per-game state. */
export function GameTile({ game, art }: { game: Game; art?: string }) {
  const { account, toggleFavourite } = useAccount();
  const meta = metaFor(game);
  const favourite = account?.favourites.includes(game.slug) ?? false;

  return (
    <Link
      href={`/game/${game.slug}`}
      prefetch={false}
      className="group relative block overflow-hidden rounded-[var(--radius-tile)] border border-border bg-surface transition-transform active:scale-[0.98] hover:border-gold/50"
    >
      <div className="pointer-events-none absolute top-2 left-2 z-10 flex gap-1">
        {meta.isNew ? (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
            New
          </span>
        ) : null}
        {meta.isHot ? (
          <span className="rounded bg-live px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
            Hot
          </span>
        ) : null}
      </div>

      {/* Only offered once there is an account to save it to. Stops the heart
          being a button that silently does nothing to a signed-out visitor. */}
      {account ? (
        <button
          onClick={(event) => {
            // The tile is a link; a click on the heart must not navigate.
            event.preventDefault();
            toggleFavourite(game.slug);
          }}
          aria-label={favourite ? `Remove ${game.name} from favourites` : `Add ${game.name} to favourites`}
          aria-pressed={favourite}
          className="absolute top-2 right-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/45 backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${favourite ? 'fill-live stroke-live' : 'fill-none stroke-white'}`} strokeWidth="2">
            <path d="M12 20.5 4.2 13a4.7 4.7 0 0 1 6.6-6.7l1.2 1.1 1.2-1.1A4.7 4.7 0 0 1 19.8 13Z" />
          </svg>
        </button>
      ) : null}

      {/* Cover art comes from `scripts/build-art.mjs` — a supplied thumbnail
          where there is one, generated artwork otherwise. The gradient stays as
          the background so a tile still looks right in the instant before its
          art decodes, and if the art is missing entirely. */}
      <div
        className="aspect-[4/3] overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(160deg, ${game.gradient.split(',').join(', ')})`,
        }}
      >
        <img
          src={art ?? `/art/${game.slug}.svg`}
          alt=""
          width={400}
          height={300}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-xs text-muted">{game.provider}</p>
          <p className="shrink-0 text-[11px] text-muted tabular-nums">RTP {meta.rtp}%</p>
        </div>
        {meta.jackpot !== null ? (
          <p className="mt-0.5 truncate text-[11px] font-semibold text-gold tabular-nums">
            € {Math.round(meta.jackpot).toLocaleString('en-IE')}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
