/** Catalogue types and URL shapes. No Node imports — the tiles use this too. */

export type SliceAsset = { path: string; bytes: number };

/** Presentation only. Every game boots the same bundle; the gradient and symbol are what differ. */
export type Game = {
  slug: string;
  name: string;
  provider: string;
  symbol: string;
  gradient: string;
};

export type Catalogue = {
  /** Content hash of the whole bundle. It is in every asset URL, so a URL never changes meaning. */
  bundleVersion: string;
  /** The files needed to reach the Play screen, largest first. */
  slice: SliceAsset[];
  games: Game[];
};

export function assetUrl(bundleVersion: string, path: string): string {
  return `/cdn/${bundleVersion}/${path}`;
}
