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
 *  - The page names the asset tier and the audio format, because the bundle
 *    picks one of each at boot and caching the other spends a player's
 *    bandwidth on bytes nothing reads.
 *  - The phases are strictly ordered — slice, then audio, then the rest of the
 *    bundle — and each is gated on the throughput measured by the one before.
 *    Only the slice gates the Play screen, so nothing after it may delay it.
 *  - The full set is warmed only for a player the lobby says is worth it. It is
 *    38.8 MB, more than the slice and audio together, and event logs put a cold
 *    visitor's chance of opening any game at 4.5%. See lib/recent.ts.
 *  - The worker only serves; it never rewrites or injects. The certified game
 *    bundle stays byte-identical to what the regulator signed off.
 *  - It handles `/cdn/` and nothing else. `/original/` is deliberately outside
 *    that prefix so the Compare panel's baseline is a load this worker never
 *    touches — not a load it serves from the network, which is a different and
 *    slightly faster thing.
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
/**
 * Marks the whole bundle as cached, not just the Play-screen slice. Separate
 * from READY because the two are reached by different players: every visitor
 * gets the slice, only a returning one gets the full set.
 */
const FULL = '/__eog-full';
/** The bundle boots one tier or the other; a cache warmed for one is not warm for the other. */
const TIERS = ['@1x', '@0.5x'];
const TIER_TOKEN = '{tier}';
/** Floor for starting the audio phase, in Mbps, measured off the slice that just downloaded. */
const MIN_MBPS = 3;
/**
 * Floor for the full set, measured off the audio that just downloaded.
 *
 * Higher than the audio floor because the set is 3.6x larger: at 5 Mbps the
 * 38.8 MB lands in about a minute of background transfer, and below that the
 * worker would be occupying a slow link for two minutes or more for bytes
 * nobody is waiting on. Deliberately a throughput test rather than a Wi-Fi
 * test — a good mobile connection should get this, and a bad Wi-Fi one should
 * not. Ordinary 4G measures well clear of the floor; 3G does not.
 */
const MIN_MBPS_FULL = 5;
/** Howler takes the first format the browser can decode: ogg on Chrome and Firefox, mp3 on Safari. */
const FORMATS = ['ogg', 'mp3'];
const FMT_TOKEN = '{fmt}';

/**
 * The bundle appends `?version=` to every sound URL. That query is a
 * cache-buster for a server that does not version its paths; ours does, in the
 * `/cdn/{bundleVersion}/` segment, so the query carries no meaning and keying on
 * it would just mean the prefetch and the game never share an entry. Dropping it
 * on both put and match keeps one entry per file.
 */
const cacheKey = (url) => url.origin + url.pathname;

/** Markers name the copy too: each copy is cached independently of the others. */
const readyMarker = (tier, copy) =>
  `${READY}?tier=${encodeURIComponent(tier)}&copy=${encodeURIComponent(copy)}`;
/** Keyed on both axes: the full set holds tiered images and format-specific sound. */
const fullMarker = (tier, format, copy) =>
  `${FULL}?tier=${encodeURIComponent(tier)}&fmt=${encodeURIComponent(format)}&copy=${encodeURIComponent(copy)}`;

/** DEMO ONLY — see lib/copies.ts. Production serves one copy and caches it once. */
const COPIES = ['a', 'b', 'c'];
const SHARED_COPY = 'c';
/** `/cdn/<version>-<copy>/…` — the copy suffix rides on the version segment. */
const copyVersion = (bundleVersion, copy) => `${bundleVersion}-${copy}`;
/** The version a cached URL belongs to, with any copy suffix taken back off. */
const baseVersionOf = (pathname) => (pathname.split('/')[2] ?? '').replace(/-[a-z]$/, '');

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
  if (event.data?.type !== 'prefetch') return;
  // An older cached page may not name one. '@1x' is what the slice used to hard-code.
  const tier = TIERS.includes(event.data.tier) ? event.data.tier : '@1x';
  const format = FORMATS.includes(event.data.format) ? event.data.format : null;
  // Opt-in, and only the page can opt in — it is the side that knows which
  // games this player has opened, and so which copies hold a favourite.
  const full = Array.isArray(event.data.fullCopies)
    ? event.data.fullCopies.filter((copy) => COPIES.includes(copy))
    : [];
  event.waitUntil(prefetchSlice(tier, format, full));
});

/**
 * Only bundle assets are cache-first. HTML and everything else stays
 * network-first, so a lobby deploy is visible immediately.
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(CDN)) return;

  // A ranged request wants a 206, and the Cache API stores neither: putting one
  // throws, and answering it from a whole cached body ignores the range the
  // caller asked for. Audio here is decoded through Web Audio, which fetches
  // whole files, so this only ever catches a media element seeking.
  if (event.request.headers.has('range')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = cacheKey(url);
      const hit = await cache.match(key);
      if (hit) return hit;

      const response = await fetch(event.request);
      if (response.ok) void cache.put(key, response.clone());
      return response;
    })(),
  );
});

async function prefetchSlice(tier, format, full) {
  const cache = await caches.open(CACHE);

  try {
    const { bundleVersion, slice, audio, rest } = await fetch('/catalogue.json').then((r) =>
      r.json(),
    );

    // A version bump makes every URL new, so drop what the old one left behind
    // — and with it every marker, which vouches for files that are now gone.
    // The markers survive an ordinary visit, so a warm cache still reads as
    // ready on the first poll instead of flickering back to 'caching'.
    const stale = (await cache.keys()).filter((request) => {
      const { pathname } = new URL(request.url);
      // Compare the *base* version: `<version>-a` and `<version>-c` are copies
      // of the same bundle, not a stale one, and must survive each other.
      return pathname.startsWith(CDN) && baseVersionOf(pathname) !== bundleVersion;
    });
    if (stale.length > 0) {
      for (const request of await cache.keys()) await cache.delete(request);
    }

    const slicePaths = slice.map((asset) => asset.path.split(TIER_TOKEN).join(tier));
    const audioPaths = format
      ? audio.map((asset) => asset.path.split(FMT_TOKEN).join(format))
      : null;
    const restPaths = Array.isArray(rest)
      ? rest.map((asset) =>
          asset.path.split(TIER_TOKEN).join(tier).split(FMT_TOKEN).join(format),
        )
      : null;

    // The shared copy first, always. It is what the other twenty-eight games
    // boot from, so until it is warm most of the catalogue is still cold — and
    // a favourite the player has not opened yet is worth less than a lobby
    // where everything opens.
    const measured = await warmCopy(cache, bundleVersion, SHARED_COPY, tier, format, {
      slicePaths,
      audioPaths,
      restPaths: null,
    });
    if (!measured) return;

    // Then the favourites, each to full depth. Only these copies get `rest`,
    // which is the whole point of the demo: a game served from `a` or `b` never
    // fetches anything, one served from `c` still streams while it plays.
    if (!format || !restPaths) return;
    for (const copy of full) {
      const done = await warmCopy(cache, bundleVersion, copy, tier, format, {
        slicePaths,
        audioPaths,
        restPaths,
      });
      if (!done) return;
    }
  } catch {
    // Prefetch is an optimisation. A failure means the player waits the normal
    // amount of time, which is exactly the pre-prefetch behaviour.
  }
}

/**
 * Warms one copy: slice, then audio, then — only when `restPaths` is given —
 * the remainder of the bundle. Each phase is gated on what the one before it
 * measured, and writes its marker only if it completed.
 *
 * Returns false when a phase failed or the link was judged too slow to carry
 * the next one, so the caller can stop rather than start another copy on a
 * connection that could not finish this one.
 */
async function warmCopy(cache, bundleVersion, copy, tier, format, { slicePaths, audioPaths, restPaths }) {
  const version = copyVersion(bundleVersion, copy);

  // Nothing fetched yet, so nothing measured: a cache that is already warm
  // tells us nothing about the link and must not be read as a slow one.
  let measured = { bytes: 0, ms: 0 };
  if (!(await cache.match(readyMarker(tier, copy)))) {
    measured = await warm(cache, version, slicePaths);
    if (!measured.ok) return false;
    await cache.put(readyMarker(tier, copy), new Response(''));
  }

  // Only now, with this copy reported ready and its games already instant. The
  // bundle asks for 16.6 MB of sound during boot, more than twice the slice,
  // but the Play screen does not gate on any of it — warming it first would
  // trade the win this whole worker exists for against a background track.
  if (!audioPaths) return true;
  if (!canAfford(measured, MIN_MBPS)) return false;
  const afterAudio = await warm(cache, version, audioPaths);
  if (!afterAudio.ok) return false;

  // The rest of the bundle: the spines behind the reels, the pay table, the
  // free-spins loop the audio phase leaves out — 38.8 MB that turns a game that
  // opens instantly into one that never loads anything at all. Last, because
  // nothing here is on the path to any screen.
  if (!restPaths) return true;
  if (await cache.match(fullMarker(tier, format, copy))) return true;
  // Judged on the audio that just downloaded rather than the slice, so the
  // reading is the most recent one available. A warm cache measures nothing
  // and falls back to whatever the slice saw, which is the same convention.
  if (!canAfford(afterAudio.bytes > 0 ? afterAudio : measured, MIN_MBPS_FULL)) return false;
  const afterRest = await warm(cache, version, restPaths);
  // Only a complete set earns the marker. A partial one still helped — every
  // file it did fetch is cached — but the page must not claim otherwise, and
  // the next visit resumes from where this one stopped.
  if (afterRest.ok) await cache.put(fullMarker(tier, format, copy), new Response(''));
  return afterRest.ok;
}

/**
 * Sequential, not parallel: the point is to stay out of the way of foreground
 * requests. Parallel prefetch measurably slows the load it is meant to help.
 *
 * Reports `ok: false` on the first asset that will not load, so a caller can
 * decline to write a marker claiming a set is complete when it is not, and
 * reports the bytes and milliseconds it actually spent on the network so the
 * caller can judge the connection from what happened rather than from an
 * estimate. Assets already in the cache cost nothing and are not counted.
 */
async function warm(cache, version, paths) {
  let bytes = 0;
  let ms = 0;
  for (const path of paths) {
    const url = `${CDN}${version}/${path}`;
    if (await cache.match(url)) continue;

    const started = Date.now();
    const response = await fetch(url, { priority: 'low' });
    if (!response.ok) return { ok: false, bytes, ms };
    // Read the length before `put` consumes the body. `fetch` settles on
    // headers, so the transfer happens inside `put` — timing across both is
    // what actually measures the download.
    const length = Number(response.headers.get('content-length'));
    await cache.put(url, response);
    ms += Date.now() - started;
    if (Number.isFinite(length) && length > 0) bytes += length;
  }
  return { ok: true, bytes, ms };
}

/**
 * Whether this connection can afford the next phase on top of what it has done.
 *
 * Measured from the slice that just downloaded — real bytes over real
 * milliseconds on the player's own link, not `navigator.connection.downlink`,
 * which read 1.55 Mbps on a link measured at 31-55 Mbps and never corrected.
 *
 * Two points bracket the floor. At 8 Mbps the prefetch helps even when a game is
 * opened mid-flight: 2,769 ms against 5,430 ms cold. Far below that it inverts,
 * because the audio is not what the boot waits on — those bytes end up competing
 * with the spines the Play screen actually needs. Nothing fetched means the
 * cache was already warm, which is not evidence of a slow link.
 */
function canAfford({ bytes, ms }, floorMbps) {
  if (bytes === 0 || ms === 0) return true;
  return (bytes * 8) / (1000 * ms) >= floorMbps;
}
