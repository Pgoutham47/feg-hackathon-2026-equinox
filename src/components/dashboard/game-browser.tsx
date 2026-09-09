'use client';

import { useMemo, useState } from 'react';

import { GameTile } from '@/components/game-tile';
import { useAccount } from '@/lib/account';
import type { Game } from '@/lib/catalogue';
import { CATEGORIES, type CategoryId, inCategory, matchesQuery, metaFor } from '@/lib/demo-data';

/**
 * The catalogue, filterable.
 *
 * A client component, but Next renders it on the server too, so the tiles are
 * still in the HTML for the first paint — which the prefetch depends on. That
 * only holds while the initial state is the unfiltered one: reading a saved
 * filter out of storage here would change what the server rendered and break
 * hydration, so the view always starts on All.
 */
export function GameBrowser({
  games,
  art,
  query,
}: {
  games: Game[];
  art: Record<string, string>;
  query: string;
}) {
  const [category, setCategory] = useState<CategoryId>('all');
  const [provider, setProvider] = useState('all');
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const { account } = useAccount();

  const providers = useMemo(
    () => [...new Set(games.map((game) => game.provider))].sort(),
    [games],
  );

  const shown = useMemo(
    () =>
      games.filter(
        (game) =>
          inCategory(game, category) &&
          matchesQuery(game, query) &&
          (provider === 'all' || game.provider === provider) &&
          (!onlyFavourites || (account?.favourites.includes(game.slug) ?? false)),
      ),
    [games, category, query, provider, onlyFavourites, account],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((c) => [c.id, games.filter((game) => inCategory(game, c.id)).length]),
      ) as Record<CategoryId, number>,
    [games],
  );

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                category === c.id
                  ? 'bg-gold text-black'
                  : 'border border-border bg-surface text-muted hover:text-text'
              }`}
            >
              {c.label}
              <span className="ml-1.5 text-xs opacity-60 tabular-nums">{counts[c.id]}</span>
            </button>
          ))}
        </div>

        {account ? (
          <button
            onClick={() => setOnlyFavourites((v) => !v)}
            aria-pressed={onlyFavourites}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              onlyFavourites
                ? 'border-live bg-live/15 text-live'
                : 'border-border bg-surface text-muted hover:text-text'
            }`}
          >
            ♥ Favourites
            <span className="ml-1.5 text-xs opacity-70 tabular-nums">
              {account.favourites.length}
            </span>
          </button>
        ) : null}

        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          aria-label="Filter by provider"
          className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted outline-none focus:border-gold"
        >
          <option value="all">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">Nothing matches that</p>
          <p className="mt-1 text-sm text-muted">
            {onlyFavourites && (account?.favourites.length ?? 0) === 0
              ? 'Tap the heart on a game to save it here.'
              : 'Try a different category, provider or search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((game) => (
            <GameTile key={game.slug} game={game} art={art[game.slug]} />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Showing {shown.length} of {games.length} games ·{' '}
        {shown.reduce((total, game) => total + metaFor(game).playersNow, 0).toLocaleString('en-IE')}{' '}
        playing now
      </p>
    </section>
  );
}
