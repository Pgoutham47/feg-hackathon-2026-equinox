import type { GameSummary } from '@eog/api-client';

import { GameTile } from './game-tile';

export function GameGrid({ games }: { games: GameSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {games.map((game) => (
        <GameTile key={game.slug} game={game} />
      ))}
    </div>
  );
}
