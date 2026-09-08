import { GameTile } from '@/components/game-tile';
import { Prefetch } from '@/components/prefetch';
import { getCatalogue } from '@/lib/catalogue.server';

export default async function LobbyPage() {
  // Rendered on the server so the tiles are in the HTML: the prefetch must be
  // able to start before hydration, which is most of the win.
  const { games } = await getCatalogue();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Lobby</h1>
        <Prefetch gameCount={games.length} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {games.map((game) => (
          <GameTile key={game.slug} game={game} />
        ))}
      </div>
    </main>
  );
}
