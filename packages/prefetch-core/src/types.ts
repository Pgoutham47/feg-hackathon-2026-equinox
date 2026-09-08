/**
 * What the worker already had in Cache Storage when a load started. Reported
 * with every load sample; `cold` means nothing was cached.
 */
export type LoadTier = 'cold' | 'slice' | 'animation' | 'audio' | 'full';

/**
 * What a manifest can be asked for. `cold` is not a manifest — it is the absence
 * of one — so it is excluded here rather than being a valid request.
 */
export type ManifestTier = Exclude<LoadTier, 'cold'>;

export type AssetRef = {
  path: string;
  bytes: number;
  contentHash: string;
  url: string;
};

export type SliceManifest = {
  gameSlug: string;
  bundleVersion: string;
  engineVersion: string;
  tier: ManifestTier;
  totalBytes: number;
  assets: AssetRef[];
};

export type PolicyConfig = {
  halfLifeDays: number;
  popularityWeight: number;
  stickiness: number;
  maxGames: number;
  budgetBytes: number;
};

export type RankedGame = {
  gameSlug: string;
  score: number;
  sliceBytes: number;
  reason: 'recent' | 'popular' | 'sticky';
};

export type PrefetchPlan = {
  policy: PolicyConfig;
  games: RankedGame[];
  sharedAssets: string[];
  generatedAt: string;
};

export const SW_MESSAGES = {
  /** Sent once on activation, before any prefetch, to hand over the API origin. */
  CONFIGURE: 'eog:configure',
  APPLY_PLAN: 'eog:apply-plan',
  PREFETCH_GAME: 'eog:prefetch-game',
  READY_SET: 'eog:ready-set',
} as const;

/**
 * Messages crossing the page ↔ worker boundary arrive as `any`. These narrow
 * them at the boundary so nothing downstream has to trust the shape — the
 * worker outlives any single page load, so an old worker can send a payload the
 * current page was never compiled against.
 */
export function parseReadySet(data: unknown): string[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as { type?: unknown; slugs?: unknown };
  if (message.type !== SW_MESSAGES.READY_SET) return null;
  if (!Array.isArray(message.slugs)) return null;
  return message.slugs.filter((s): s is string => typeof s === 'string');
}

const LOAD_TIERS: readonly LoadTier[] = ['cold', 'slice', 'animation', 'audio', 'full'];

export function parseGameReady(data: unknown): { tier: LoadTier } | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as { type?: unknown; tier?: unknown };
  if (message.type !== 'game:ready') return null;
  const tier = LOAD_TIERS.find((t) => t === message.tier) ?? 'cold';
  return { tier };
}
