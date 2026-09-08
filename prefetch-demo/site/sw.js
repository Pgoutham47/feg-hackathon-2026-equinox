/**
 * The caching engine.
 *
 * Everything the certified bundle asks for lives under `/bundle/`, and this
 * worker is registered from the lobby at the site root, so one worker covers the
 * lobby, the wrapper page and the bundle itself. That is the whole trick: a
 * worker only controls clients on its own origin and inside its own scope, so
 * the game has to be served from the same origin as the lobby or none of this
 * reaches it.
 *
 * Invariants:
 *  - The worker only reads and stores. It never rewrites a response body, so the
 *    certified bundle is byte-identical to what the regulator signed off.
 *  - Cache keys include the query string, because the bundle cache-busts its CSS
 *    with `?v=` and its audio with `?version=` and those are different resources.
 *  - Prefetch is sequential and low priority, and aborts the moment the plan
 *    changes, so it never contends with a load the player is waiting on.
 *  - `play` work preempts `after` work: reaching the Play button always wins
 *    over topping up the reel art.
 */

const VERSION = 'v2';
const CACHE = `eog-${VERSION}`;

/** Everything under here is the certified bundle and is served cache-first. */
const BUNDLE_ROOT = new URL('bundle/', self.registration.scope).pathname;

/** URLs known to be in the cache. Hydrated on activate, kept in step after. */
const resident = new Set();

/** Sequential job queues. `play` is drained before `after`. */
const queues = { play: [], after: [] };
let running = false;
let abort = null;

/**
 * Per-load hit/miss accounting.
 *
 * The page cannot work this out for itself: `PerformanceResourceTiming
 * .transferSize` reads 0 both for a response this worker served from cache and
 * for one it fetched over the network on the page's behalf, so from the page
 * every load looks like a total cache hit. Only the worker knows which was
 * which, so it counts, and the wrapper resets the counter before each launch.
 */
let stats = { hits: 0, misses: 0, hitBytes: 0, missBytes: 0 };

const resetStats = () => {
  stats = { hits: 0, misses: 0, hitBytes: 0, missBytes: 0 };
};

function sizeOf(response) {
  const len = Number(response.headers.get('content-length'));
  return Number.isFinite(len) && len > 0 ? len : 0;
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
      await hydrate();
      broadcast({ type: 'sw:status', ...(await status()) });
    })(),
  );
});

async function hydrate() {
  resident.clear();
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) resident.add(request.url);
}

function isBundleRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(BUNDLE_ROOT);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Range requests are for media seeking; a partial response must never be
  // stored under the key of the whole file.
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (!isBundleRequest(url)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: CACHE });
      if (cached) {
        stats.hits += 1;
        stats.hitBytes += sizeOf(cached);
        return cached;
      }

      const response = await fetch(request);
      stats.misses += 1;
      stats.missBytes += sizeOf(response);
      // Never store a 404. `book.png` is referenced by book.atlas but is not in
      // the bundle, and caching its 404 would make the miss permanent.
      if (response.ok && response.status === 200) {
        const cache = await caches.open(CACHE);
        const clone = response.clone();
        event.waitUntil(
          cache.put(request, clone).then(() => {
            resident.add(request.url);
          }),
        );
      }
      return response;
    })(),
  );
});

// ---------------------------------------------------------------------------
// Page -> worker protocol
// ---------------------------------------------------------------------------

self.addEventListener('message', (event) => {
  const data = event.data || {};
  switch (data.type) {
    case 'sw:prefetch':
      enqueue(data.kind === 'after' ? 'after' : 'play', data.key, data.files || []);
      break;
    case 'sw:cancel':
      cancelAll();
      break;
    case 'sw:status':
      event.waitUntil(status().then((s) => reply(event, { type: 'sw:status', ...s })));
      break;
    case 'sw:have':
      event.waitUntil(
        have(data.files || []).then((r) => reply(event, { type: 'sw:have', key: data.key, ...r })),
      );
      break;
    case 'sw:clear':
      event.waitUntil(clear().then(() => reply(event, { type: 'sw:cleared' })));
      break;
    case 'sw:stats-reset':
      resetStats();
      reply(event, { type: 'sw:stats-reset' });
      break;
    case 'sw:stats':
      reply(event, { type: 'sw:stats', id: data.id, ...stats });
      break;
    default:
      break;
  }
});

function reply(event, message) {
  if (event.source) event.source.postMessage(message);
  else broadcast(message);
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage(message);
}

function absolute(file) {
  // Slice paths are bundle-relative ("assets/…", "index.html") so the same
  // slices.json works whatever path the site is deployed under.
  return new URL(file, new URL(BUNDLE_ROOT, self.location.origin)).href;
}

async function have(files) {
  const urls = files.map(absolute);
  const missing = urls.filter((u) => !resident.has(u));
  return { total: urls.length, missing: missing.length, complete: missing.length === 0 };
}

async function status() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  let bytes = 0;
  // Cache Storage has no size API, so read what we stored. This is only called
  // for the overlay, never on the load path.
  for (const key of keys) {
    const res = await cache.match(key);
    if (!res) continue;
    const len = Number(res.headers.get('content-length'));
    bytes += Number.isFinite(len) && len > 0 ? len : (await res.clone().blob()).size;
  }
  return { entries: keys.length, bytes, queued: queues.play.length + queues.after.length };
}

async function clear() {
  cancelAll();
  await caches.delete(CACHE);
  resident.clear();
}

function cancelAll() {
  queues.play.length = 0;
  queues.after.length = 0;
  if (abort) abort.abort();
  abort = null;
}

function enqueue(kind, key, files) {
  // A repeat request for something already queued is a no-op, so the dwell and
  // pointerdown triggers are cheap to spam.
  if (queues[kind].some((job) => job.key === key)) return;
  queues[kind].push({ kind, key, files });
  void drain();
}

async function drain() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = queues.play.shift() || queues.after.shift();
      if (!job) break;
      await run(job);
    }
  } finally {
    running = false;
    broadcast({ type: 'sw:idle', ...(await status()) });
  }
}

async function run(job) {
  abort = new AbortController();
  const { signal } = abort;
  const cache = await caches.open(CACHE);
  const urls = job.files.map(absolute);

  let done = 0;
  let bytes = 0;
  for (const url of urls) {
    if (signal.aborted) return;
    done += 1;
    if (resident.has(url)) continue;
    try {
      // One at a time, low priority: the point is to stay behind anything the
      // player is actually waiting for. Parallel prefetch measurably slows the
      // load it is meant to help.
      const response = await fetch(url, { signal, priority: 'low', credentials: 'same-origin' });
      if (response.ok && response.status === 200) {
        const size = (await response.clone().blob()).size;
        await cache.put(url, response);
        resident.add(url);
        bytes += size;
      }
    } catch {
      // A prefetch failure just means the player waits the normal amount of
      // time, which is exactly the pre-prefetch behaviour.
      if (signal.aborted) return;
    }
    if (done % 4 === 0) {
      broadcast({ type: 'sw:progress', key: job.key, kind: job.kind, done, total: urls.length, bytes });
    }
  }

  abort = null;
  const summary = await have(job.files);
  broadcast({
    type: 'sw:ready',
    key: job.key,
    kind: job.kind,
    total: urls.length,
    bytes,
    complete: summary.complete,
  });
}
