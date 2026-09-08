/// <reference lib="webworker" />
/**
 * The caching engine.
 *
 * Invariants that make this safe to ship to real players:
 *  - Every cached URL is content-versioned, so a stale entry is impossible and
 *    the worker never needs to invalidate — only evict.
 *  - Cache names carry the worker version; activate() deletes every other cache,
 *    so a bad deploy is fully recovered by shipping the next one.
 *  - Prefetch requests are low priority and abort on navigation, so they never
 *    contend with the load the player is actually waiting on.
 *  - The worker only serves; it never rewrites or injects. The certified game
 *    bundle is byte-identical to what the regulator signed off.
 */
import { SW_MESSAGES, type PrefetchPlan, type SliceManifest } from './types';

declare const self: ServiceWorkerGlobalScope;

const VERSION = 'v1';
const CACHE = `eog-assets-${VERSION}`;
// Only a fallback. The page sends the real API origin via CONFIGURE on every
// load, because the API is a different origin from the lobby in every
// environment except a bare local run.
let apiBaseUrl = new URL(self.registration.scope).origin;
// The bundle is served under this path on the worker's OWN origin. That is not
// a detail: a worker cannot control a cross-origin iframe, so a bundle hosted
// anywhere else is invisible here and every prefetched byte is wasted.
let cdnBasePath = '/cdn/';
let inflight: AbortController | null = null;
const resident = new Set<string>();
/**
 * Canonical URL of every shared asset in the cache, keyed by its
 * bundle-relative path — see resolveShared().
 */
const sharedByPath = new Map<string, string>();
let hydration: Promise<void> | null = null;

/**
 * Rebuild the in-memory indexes from Cache Storage, once.
 *
 * The browser stops an idle worker constantly and restarts it for the next
 * request, which empties every module-level Map. Rebuilding only in activate()
 * is therefore not enough: a restarted worker would stop resolving shared
 * assets and quietly let every game re-download the engine it already has.
 */
function indexed(): Promise<void> {
  hydration ??= hydrateResidentSet();
  return hydration;
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
      hydration = hydrateResidentSet();
      await hydration;
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only game bundle assets are cache-first. HTML and API calls stay network-first
  // so a lobby deploy is visible immediately.
  if (!isBundleAsset(url)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: CACHE, ignoreSearch: false });
      if (cached) return cached;

      const shared = await resolveShared(url);
      if (shared) return shared;

      const response = await fetch(request);
      if (response.ok && response.status === 200) {
        const cache = await caches.open(CACHE);
        void cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data as
    | { type: typeof SW_MESSAGES.CONFIGURE; apiBaseUrl: string; cdnBasePath?: string }
    | { type: typeof SW_MESSAGES.APPLY_PLAN; plan: PrefetchPlan; apiBaseUrl?: string }
    | { type: typeof SW_MESSAGES.PREFETCH_GAME; slug: string; reason: string };

  if (data?.type === SW_MESSAGES.CONFIGURE) {
    apiBaseUrl = data.apiBaseUrl;
    if (data.cdnBasePath) cdnBasePath = withTrailingSlash(data.cdnBasePath);
    event.waitUntil(broadcastReady());
  } else if (data?.type === SW_MESSAGES.APPLY_PLAN) {
    if (data.apiBaseUrl) apiBaseUrl = data.apiBaseUrl;
    void applyPlan(data.plan);
  } else if (data?.type === SW_MESSAGES.PREFETCH_GAME) {
    void prefetchGame(data.slug);
  }
});

function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Same origin, under the bundle prefix. Scoped deliberately: matching on
 * `/assets/` alone would also swallow the lobby's own requests, and a
 * cross-origin URL can never reach this worker in the first place.
 */
function isBundleAsset(url: URL): boolean {
  return url.origin === self.location.origin && url.pathname.startsWith(cdnBasePath);
}

const SHARED_URL = /\/_shared\/[^/]+\/(.+)$/;

/** Remember a cached shared asset so any game's copy of that path can find it. */
function noteCached(rawUrl: string): void {
  const path = SHARED_URL.exec(new URL(rawUrl, self.location.origin).pathname)?.[1];
  if (path) sharedByPath.set(path, rawUrl);
}

/**
 * The bundle requests every file under its own `/{slug}/{version}/` prefix,
 * because its index.html references them relatively and we do not modify it.
 * Assets shared across the catalogue are cached once under `/_shared/`, so a
 * game's request for one is a miss on the address alone — the bytes are already
 * here and their content hash is identical. Resolving that here is what makes
 * the shared engine free for every game after the first; without it each game
 * re-downloads the same 18 MB.
 *
 * Safe by construction: a path is either skinned for every game or shared for
 * every game, so a skinned asset never has a `_shared` entry to alias onto.
 */
async function resolveShared(url: URL): Promise<Response | undefined> {
  if (!url.pathname.startsWith(cdnBasePath)) return undefined;
  await indexed();
  const [namespace, , ...rest] = url.pathname.slice(cdnBasePath.length).split('/');
  if (!namespace || namespace === '_shared' || rest.length === 0) return undefined;

  const canonical = sharedByPath.get(rest.join('/'));
  return canonical ? caches.match(canonical, { cacheName: CACHE }) : undefined;
}

/** Pull the game slug out of `/{slug}/{version}/...` or `/games/{slug}/{version}/...`. */
const SLUG_IN_PATH = /\/(?:games\/)?([a-z0-9-]+)\/[a-f0-9]{6,}\//;

function slugFromPath(pathname: string): string | null {
  return SLUG_IN_PATH.exec(pathname)?.[1] ?? null;
}

async function hydrateResidentSet(): Promise<void> {
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) {
    noteCached(request.url);
    const slug = slugFromPath(new URL(request.url).pathname);
    if (slug) resident.add(slug);
  }
  await broadcastReady();
}

async function broadcastReady(): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: SW_MESSAGES.READY_SET, slugs: [...resident] });
  }
}

async function applyPlan(plan: PrefetchPlan): Promise<void> {
  // A new plan supersedes whatever was in flight — the old ranking is stale.
  inflight?.abort();
  inflight = new AbortController();
  const { signal } = inflight;

  // Evict games the plan dropped, so the budget is respected on a real device
  // and Cache Storage never grows unbounded.
  const wanted = new Set(plan.games.map((g) => g.gameSlug));
  await evictExcept(wanted);

  // Sequential, not parallel: the point is to stay out of the way of foreground
  // requests. Parallel prefetch measurably slows the load it is meant to help.
  for (const game of plan.games) {
    if (signal.aborted) return;
    await prefetchGame(game.gameSlug, signal);
  }
}

async function prefetchGame(slug: string, signal?: AbortSignal): Promise<void> {
  await indexed();
  if (resident.has(slug)) return;
  try {
    const manifest: SliceManifest = await fetch(
      `${apiBaseUrl}/v1/games/${slug}/manifest?tier=slice`,
      { signal },
    ).then((r) => r.json());

    const cache = await caches.open(CACHE);
    for (const asset of manifest.assets) {
      if (signal?.aborted) return;
      // Index every asset, including ones already resident. A shared asset paid
      // for by an earlier game is still this game's shared asset; skipping the
      // index here is what silently breaks the alias for the second game on.
      noteCached(asset.url);
      if (await cache.match(asset.url)) continue;
      const response = await fetch(asset.url, { signal, priority: 'low' });
      if (!response.ok) continue;
      await cache.put(asset.url, response);
    }
    resident.add(slug);
    await broadcastReady();
  } catch {
    // Prefetch is an optimisation. A failure means the player waits the normal
    // amount of time, which is exactly the pre-prefetch behaviour.
  }
}

async function evictExcept(keep: Set<string>): Promise<void> {
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.includes('/_shared/')) continue; // shared engine is always worth keeping
    const slug = slugFromPath(path);
    if (slug && !keep.has(slug)) {
      await cache.delete(request);
      resident.delete(slug);
    }
  }
}

export {};
