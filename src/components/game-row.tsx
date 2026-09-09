import { GameTile } from '@/components/game-tile';
import type { Game } from '@/lib/catalogue';

/**
 * A titled strip of games above the catalogue.
 *
 * Both the recently-played row and the recommendations are this: the same
 * tiles, the same grid, a different heading and a different list. They also
 * share a property worth knowing — every game in either row is served from a
 * fully cached copy of the bundle, so they open with nothing left to fetch.
 *
 * Server-rendered, because both lists are fixed constants for the demo. That
 * puts the rows in the HTML: they are there on first paint, with no flash of an
 * empty lobby and nothing to wait for.
 */
export function GameRow({
  title,
  slugs,
  games,
  art,
}: {
  title: string;
  slugs: string[];
  games: Game[];
  art: Record<string, string>;
}) {
  const bySlug = new Map(games.map((game) => [game.slug, game]));
  const shown = slugs
    // A pinned slug can name a game the catalogue no longer has.
    .map((slug) => bySlug.get(slug))
    .filter((game): game is Game => game !== undefined);

  if (shown.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {shown.map((game) => (
          <GameTile key={game.slug} game={game} art={art[game.slug]} />
        ))}
      </div>
    </section>
  );
}
