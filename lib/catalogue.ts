/** Catalogue types and URL shapes. No Node imports — the tiles use this too. */

export type SliceAsset = {
  path: string;
  bytes: number;
  /** Shared across the whole catalogue — fetched once, then free for every game. */
  shared: boolean;
};

export type Game = {
  slug: string;
  name: string;
  provider: string;
  symbol: string;
  gradient: string;
  /** Content hash of the baked skin pack. It is in every asset URL, so a URL never changes meaning. */
  bundleVersion: string;
  /** 0..1 cold-start prior, used to rank games before a device has any history. */
  popularity: number;
  /** The files needed to reach the Play screen, largest first. */
  slice: SliceAsset[];
};

export type Catalogue = { engineVersion: string; games: Game[] };

export function thumbnailUrl(game: Game): string {
  return `/cdn/${game.slug}/${game.bundleVersion}/thumb.webp`;
}

export function bundleUrl(game: Game): string {
  return `/cdn/${game.slug}/${game.bundleVersion}/index.html`;
}
