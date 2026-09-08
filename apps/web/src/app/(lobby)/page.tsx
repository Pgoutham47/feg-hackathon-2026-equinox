import { GameGrid } from '@/components/game-grid';
import { api, CATALOGUE_REVALIDATE_SECONDS } from '@/lib/api';

export const revalidate = 60;

export default async function LobbyPage() {
  const catalogue = await api.listGames(
    { limit: 60 },
    { next: { revalidate: CATALOGUE_REVALIDATE_SECONDS, tags: ['catalogue'] } },
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Lobby</h1>
      <GameGrid games={catalogue.items} />
    </main>
  );
}
