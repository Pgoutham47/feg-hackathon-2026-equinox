/**
 * The caching engine.
 *
 * Invariants that make this safe to ship to real players:
 *  - Every cached URL contains a content version, so a stale entry is impossible
 *    and the worker never invalidates — only evicts.
 *  - The cache name carries the worker version; activate() deletes every other
 *    cache, so a bad deploy is fully recovered by shipping the next one.
 *  - Prefetches are sequential and low priority, so they never contend with the
 *    load the player is actually waiting on.
 *  - The worker only serves; it never rewrites or injects. The certified game
 *    bundle stays byte-identical to what the regulator signed off.
 */

const CACHE = 'eog-assets-v1';
const CDN = '/cdn/';
/**
 * Marks a game whose whole slice is cached. It lives in the cache rather than in
 * a variable so it survives the worker being stopped, and so the page can read
 * the set straight out of Cache Storage — which needs no message plumbing and
 * works on the first visit, before the worker controls the page.
 */
const READY = '/__eog-ready/';

/**
 * 2.2 MB shared engine, paid once, plus about 4 MB of skin per game — so this
 * is roughly the top five games. Raising it spends more of the player's data
 * for a hit rate that flattens out fast.
 */
const BUDGET_BYTES = 24 * 1024 * 1024;
const MAX_GAMES = 5;
/** Recency half-life for the ranking: a game played today outranks one played weekly last month. */
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

let catalogue = null;
const loadCatalogue = () => (catalogue ??= fetch('/catalogue.json').then((r) => r.json()));

/** A new plan supersedes whatever is in flight — the old ranking is stale. */
let inflight = null;

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'plan') event.waitUntil(applyPlan(data.recent ?? []));
  else if (data?.type === 'prefetch') event.waitUntil(prefetchGame(data.slug));
});

/**
 * Only bundle assets are cache-first. HTML and everything else stays
 * network-first, so a lobby deploy is visible immediately.
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(CDN)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;

      /*
       * Each game asks for every file under its own /{slug}/{version}/ prefix,
       * because its index.html references them relatively and we do not modify
       * it. Assets shared across the catalogue are cached once under /_shared/,
       * so a game's request for one misses on the address alone — the bytes are
       * already here. Resolving that is what makes the shared engine free for
       * every game after the first; without it, each game re-downloads it.
       */
      const shared = await matchShared(cache, url.pathname);
      if (shared) return shared;

      const response = await fetch(event.request);
      if (response.ok) void cache.put(event.request, response.clone());
      return response;
    })(),
  );
});

async function matchShared(cache, pathname) {
  const [namespace, , ...rest] = pathname.slice(CDN.length).split('/');
  if (!namespace || namespace === '_shared' || rest.length === 0) return undefined;
  const { engineVersion } = await loadCatalogue();
  return cache.match(`${CDN}_shared/${engineVersion}/${rest.join('/')}`);
}

function assetUrl(game, asset, engineVersion) {
  return asset.shared
    ? `${CDN}_shared/${engineVersion}/${asset.path}`
    : `${CDN}${game.slug}/${game.bundleVersion}/${asset.path}`;
}

/**
 * score = decayed plays on this device + popularity prior.
 *
 * Games are then packed greedily by score until the budget is spent. Greedy is
 * correct enough here: slice sizes are all within 5% of each other, so the
 * knapsack degenerates.
 */
function rank(games, recent) {
  const now = Date.now();
  const recency = new Map();
  for (const play of recent) {
    const decayed = Math.pow(0.5, (now - play.at) / HALF_LIFE_MS);
    recency.set(play.slug, (recency.get(play.slug) ?? 0) + decayed);
  }

  const scored = games
    .map((game) => ({
      game,
      score: (recency.get(game.slug) ?? 0) + game.popularity,
      skinnedBytes: game.slice.reduce((n, a) => n + (a.shared ? 0 : a.bytes), 0),
      sharedBytes: game.slice.reduce((n, a) => n + (a.shared ? a.bytes : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  const chosen = [];
  let spent = 0;
  for (const entry of scored) {
    if (chosen.length >= MAX_GAMES) break;
    // The shared engine is identical across the catalogue: whichever game is
    // cached first pays for it, and it is free for every game after that.
    const marginal = entry.skinnedBytes + (chosen.length ? 0 : entry.sharedBytes);
    if (spent + marginal > BUDGET_BYTES) continue;
    spent += marginal;
    chosen.push(entry.game);
  }
  return chosen;
}

async function applyPlan(recent) {
  inflight?.abort();
  inflight = new AbortController();
  const { signal } = inflight;

  const { games } = await loadCatalogue();
  const plan = rank(games, recent);

  // Evict what the plan dropped, so Cache Storage never grows unbounded.
  await evictExcept(new Set(plan.map((g) => g.slug)));

  // Sequential, not parallel: the point is to stay out of the way of foreground
  // requests. Parallel prefetch measurably slows the load it is meant to help.
  for (const game of plan) {
    if (signal.aborted) return;
    await prefetchGame(game.slug, signal);
  }
}

async function prefetchGame(slug, signal) {
  const cache = await caches.open(CACHE);
  if (await cache.match(READY + slug)) return;

  try {
    const { games, engineVersion } = await loadCatalogue();
    const game = games.find((g) => g.slug === slug);
    if (!game) return;

    for (const asset of game.slice) {
      if (signal?.aborted) return;
      const url = assetUrl(game, asset, engineVersion);
      if (await cache.match(url)) continue;
      const response = await fetch(url, { signal, priority: 'low' });
      if (!response.ok) continue;
      await cache.put(url, response);
    }

    await cache.put(READY + slug, new Response(''));
  } catch {
    // Prefetch is an optimisation. A failure means the player waits the normal
    // amount of time, which is exactly the pre-prefetch behaviour.
  }
}

async function evictExcept(keep) {
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    // The shared engine and the lobby thumbnails are always worth keeping:
    // every game needs the engine, and the lobby shows every thumbnail.
    if (pathname.startsWith(`${CDN}_shared/`) || pathname.endsWith('/thumb.webp')) continue;
    const slug = pathname.startsWith(READY)
      ? pathname.slice(READY.length)
      : pathname.startsWith(CDN)
        ? pathname.slice(CDN.length).split('/')[0]
        : null;
    if (slug && !keep.has(slug)) await cache.delete(request);
  }
}

