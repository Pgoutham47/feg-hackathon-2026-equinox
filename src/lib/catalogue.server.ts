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

/**
 * Slug to cover-image URL, written by `scripts/build-art.mjs`.
 *
 * A map rather than a naming convention because a game's art can be a supplied
 * `.jpg`, a `.png`, or a generated `.svg`, and the tile must not have to guess
 * the extension — or 404 half the lobby when the mix changes.
 */
let art: Promise<Record<string, string>> | null = null;

export function getArt(): Promise<Record<string, string>> {
  art ??= readFile(join(process.cwd(), 'public', 'art', 'art.json'), 'utf8')
    .then((raw) => JSON.parse(raw) as Record<string, string>)
    .catch(() => ({}));
  return art;
}
