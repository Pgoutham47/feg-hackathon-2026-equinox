import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Catalogue, Game } from '@/lib/catalogue';

/**
 * The catalogue is a single static file, served to the browser at
 * /catalogue.json and read here off disk. One source of truth for the lobby,
 * the game shell and the service worker.
 */
let cached: Promise<Catalogue> | null = null;

export function getCatalogue(): Promise<Catalogue> {
  cached ??= readFile(join(process.cwd(), 'public', 'catalogue.json'), 'utf8').then(
    (raw) => JSON.parse(raw) as Catalogue,
  );
  return cached;
}

export async function getGame(slug: string): Promise<Game | undefined> {
  const { games } = await getCatalogue();
  return games.find((game) => game.slug === slug);
}
