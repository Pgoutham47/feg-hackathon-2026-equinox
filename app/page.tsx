import { GameTile } from '@/components/game-tile';
import { Prefetch } from '@/components/prefetch';
import { getCatalogue } from '@/lib/catalogue.server';

export default async function LobbyPage() {
  // Rendered on the server so the tiles are in the HTML: the prefetch must be
  // able to start before hydration, which is most of the win.
  const { games } = await getCatalogue();

  return (
    <Prefetch>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Lobby</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {games.map((game) => (
            <GameTile key={game.slug} game={game} />
          ))}
        </div>
      </main>
    </Prefetch>
  );
}
