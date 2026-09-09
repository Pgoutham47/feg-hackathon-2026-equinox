/**
 * DEMO ONLY — three separate copies of the one bundle.
 *
 * Every game boots the same bundle, so in production there is nothing to cache
 * per game: one warm cache makes all thirty instant, which is the whole reason
 * the prefetch is cheap. That also makes the difference invisible — you cannot
 * show "this game is fully cached and that one is not" when there is only one
 * thing to cache.
 *
 * So for the demo the bundle is served under three URL namespaces. A browser
 * caches by URL, so `…/a551899a9b6edc46-a/index.html` and `…-c/index.html` are
 * two different files to it even though the bytes on disk are one file. That
 * buys a visible per-game difference at the cost of downloading the same bundle
 * more than once — 130 MB instead of 56 MB. Never ship this to players.
 *
 * The namespaces are virtual on purpose: `next.config.ts` rewrites
 * `/cdn/:version/:path*` to `/bundle/:path*` and ignores the version segment,
 * so three namespaces cost nothing on disk and no build step.
 */
/**
 * The Cache Storage bucket the worker fills. Shared by everything on the page
 * that reads it — the prefetch status line and the load timer — so they cannot
 * drift apart. `public/sw.js` keeps its own copy because a worker cannot import.
 */
export const ASSET_CACHE = 'eog-assets-v1';

export const COPIES = ['a', 'b', 'c'] as const;
export type Copy = (typeof COPIES)[number];

/** The copy every game that is not a recent favourite is served from. */
export const SHARED_COPY: Copy = 'c';

/**
 * How many recently played games get a copy to themselves, and so the full
 * precache. The rest of the catalogue shares `SHARED_COPY` and keeps the slice.
 */
export const FULL_COPIES = 2;

/**
 * DEMO ONLY — the games pinned as "recently played".
 *
 * Fixed on purpose. The real signal is `lib/recent.ts`, which fills as the
 * player opens games, but a demo needs the same two tiles in the same two
 * copies on every run: a list that reorders itself mid-demo moves a game to a
 * different copy and re-downloads a bundle on stage. Pinning also means the row
 * and the full precache are there on the very first visit, with nothing to set
 * up first.
 *
 * These must be slugs from `public/catalogue.json`. Swap them for whichever two
 * games you want to show.
 */
export const DEMO_FAVOURITES = ['multiplay-81', 'frozzy-fruits'];

/**
 * DEMO ONLY — the games the lobby pushes, served from the copies the
 * favourites already warmed.
 *
 * They are free. Every game boots the same bundle, so pointing a recommendation
 * at copy `a` costs nothing beyond what the favourite in that copy already
 * paid: no extra fetch, no extra byte, and the game opens with nothing left to
 * download. That is the property this whole scheme has, made visible — a row of
 * different games that are instant for the same price as two.
 */
export const DEMO_RECOMMENDED = [
  'hunter-s-dream-2',
  'sizzling-hot-deluxe',
  'royal-coins-2',
  'reactoonz',
];

/**
 * The games that get a copy to themselves, most important first.
 *
 * This is the one switch between demo and production. To go back to the real
 * behaviour, return `recentGames().map((game) => game.slug)` from `lib/recent`
 * instead — everything downstream already reads it through here, and it becomes
 * a client-side call again because that list lives in the browser.
 */
export function favouriteSlugs(): string[] {
  return DEMO_FAVOURITES.slice(0, FULL_COPIES);
}

/** Every game served from a fully cached copy — favourites and recommendations. */
export function warmedSlugs(): string[] {
  return [...favouriteSlugs(), ...DEMO_RECOMMENDED];
}

export function isCopy(value: unknown): value is Copy {
  return COPIES.includes(value as Copy);
}

/** The copies that hold a favourite, given how many games the player has played. */
export function fullCopies(recentCount: number): Copy[] {
  return COPIES.slice(0, Math.min(recentCount, FULL_COPIES));
}

/**
 * Which copy a game is served from.
 *
 * The two favourites take a copy each. The recommendations are spread back
 * across those same two — nothing new is warmed for them, they just ride on a
 * cache that is already full. Everything else falls to the shared copy, which
 * carries the slice and the sound but not the rest.
 */
export function copyFor(slug: string): Copy {
  const favourite = favouriteSlugs().indexOf(slug);
  if (favourite >= 0) return COPIES[favourite];

  const recommended = DEMO_RECOMMENDED.indexOf(slug);
  if (recommended >= 0) return COPIES[recommended % FULL_COPIES];

  return SHARED_COPY;
}

/** One path segment, so the existing rewrite resolves it without a change. */
export function copyVersion(bundleVersion: string, copy: Copy): string {
  return `${bundleVersion}-${copy}`;
}

/**
 * The bundle as it is with none of this: no service worker, no cache.
 *
 * `/original/` sits outside the worker's `/cdn/` prefix, so the worker's fetch
 * handler declines it and the browser loads it the ordinary way — and
 * `next.config.ts` sends it `no-store`, so the browser keeps nothing either.
 * That makes every load a first load, which is what the Compare panel needs its
 * baseline to be. Same bytes and same Brotli as `/cdn/`; only the caching
 * differs, because caching is the only thing being compared.
 */
export const ORIGINAL_PREFIX = '/original';

export function originalUrl(bundleVersion: string, path: string): string {
  return `${ORIGINAL_PREFIX}/${bundleVersion}/${path}`;
}

/** Strips the copy suffix back off, for telling a stale bundle from a sibling copy. */
export function baseVersion(versionSegment: string): string {
  return versionSegment.replace(/-[a-z]$/, '');
}
