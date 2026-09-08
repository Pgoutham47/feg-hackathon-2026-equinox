/**
 * The caching engine.
 *
 * Every game boots the same bundle, so there is exactly one thing to cache: the
 * 27 files needed to reach the Play screen. Cache them once on the lobby and
 * every game in the catalogue opens from disk.
 *
 * Invariants that make this safe to ship to real players:
 *  - Every cached URL contains the bundle's content version, so a stale entry is
 *    impossible and the worker never invalidates — only evicts.
 *  - The cache name carries the worker version; activate() deletes every other
 *    cache, so a bad deploy is fully recovered by shipping the next one.
 *  - The prefetch is sequential and low priority, so it never contends with the
 *    load the player is actually waiting on.
 *  - The worker only serves; it never rewrites or injects. The certified game
 *    bundle stays byte-identical to what the regulator signed off.
 */

const CACHE = 'eog-assets-v1';
const CDN = '/cdn/';
/**
 * Marks the slice as fully cached. It lives in the cache rather than in a
 * variable so it survives the worker being stopped, and so the page can read it
 * straight out of Cache Storage — which needs no message plumbing and works on
 * the first visit, before the worker controls the page.
 */
const READY = '/__eog-ready';

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'prefetch') event.waitUntil(prefetchSlice());
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

      const response = await fetch(event.request);
      if (response.ok) void cache.put(event.request, response.clone());
      return response;
    })(),
  );
});

async function prefetchSlice() {
  const cache = await caches.open(CACHE);
  if (await cache.match(READY)) return;

  try {
    const { bundleVersion, slice } = await fetch('/catalogue.json').then((r) => r.json());

    // A version bump makes every URL new, so drop what the old one left behind.
    for (const request of await cache.keys()) {
      if (!new URL(request.url).pathname.startsWith(`${CDN}${bundleVersion}/`)) {
        await cache.delete(request);
      }
    }

    // Sequential, not parallel: the point is to stay out of the way of
    // foreground requests. Parallel prefetch measurably slows the load it is
    // meant to help.
    for (const asset of slice) {
      const url = `${CDN}${bundleVersion}/${asset.path}`;
      if (await cache.match(url)) continue;
      const response = await fetch(url, { priority: 'low' });
      if (!response.ok) return;
      await cache.put(url, response);
    }

    await cache.put(READY, new Response(''));
  } catch {
    // Prefetch is an optimisation. A failure means the player waits the normal
    // amount of time, which is exactly the pre-prefetch behaviour.
  }
}
