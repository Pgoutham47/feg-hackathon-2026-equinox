const CACHE = 'eog-v1';
let cacheRef = null;
const cacheP = caches.open(CACHE).then(c => cacheRef = c);
const stats = {hit: 0, miss: 0, misses: []};

// --- audio deferral -------------------------------------------------------
// The game asks for 16 MB of sound before it asks for the reel symbols.
// We can't change that order — but we can make the audio WAIT its turn.
let deferAudio = false;
let audioReleased = false;
let heldCount = 0;
const waiters = [];
// once these visuals have been delivered, the game is visually complete
const VISUALS = ['symbols.webp','gameElements.webp','bigwins.png','bigwins_2.png',
                 'cup.png','low_5.png','scatter.png','chest.png','shield.png'];
const seen = new Set();
let releasedAt = null;

function noteDelivered(pathname) {
  const m = VISUALS.find(v => pathname.endsWith(v));
  if (m) seen.add(m);
  if (!audioReleased && seen.size === VISUALS.length) release('visuals-complete');
}
function release(why) {
  if (audioReleased) return;
  audioReleased = true;
  releasedAt = Math.round(performance.now());
  self.releaseReason = why;
  waiters.splice(0).forEach(fn => fn());
}
const waitForRelease = () => audioReleased ? Promise.resolve()
  : new Promise(res => { waiters.push(res); setTimeout(() => release('timeout'), 25000); });

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('.html') || url.pathname === '/') return;
  if (url.pathname.startsWith('/nocache/')) return;   // baseline lane: never cached, never served locally

  e.respondWith((async () => {
    const c = cacheRef || await cacheP;
    const hit = await c.match(e.request, {ignoreSearch: true});
    if (hit) { stats.hit++; noteDelivered(url.pathname); return hit; }

    stats.miss++;
    if (stats.misses.length < 40) stats.misses.push(url.pathname);

    // audio goes to the back of the queue until the visuals have landed
    if (deferAudio && url.pathname.endsWith('.ogg') && !audioReleased) {
      heldCount++;
      await waitForRelease();
    }
    const res = await fetch(e.request);
    noteDelivered(url.pathname);
    return res;
  })());
});

self.addEventListener('message', async e => {
  const post = m => self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage(m)));

  if (e.data?.type === 'stats')
    return post({type:'stats', ...stats, heldCount, releasedAt, releaseReason: self.releaseReason || null});

  if (e.data?.type === 'setDefer') {
    deferAudio = !!e.data.on; audioReleased = false; heldCount = 0;
    seen.clear(); releasedAt = null; self.releaseReason = null;
    return post({type:'deferSet', on: deferAudio});
  }

  if (e.data?.type === 'clear') {
    await caches.delete(CACHE);
    cacheRef = await caches.open(CACHE);
    stats.hit = 0; stats.miss = 0; stats.misses = [];
    return post({type:'cleared'});
  }

  if (e.data?.type !== 'precache') return;
  stats.hit = 0; stats.miss = 0; stats.misses = [];
  const urls = e.data.urls, cache = cacheRef || await cacheP;
  let done = 0, bytes = 0, i = 0;
  await Promise.all(Array.from({length: 6}, async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try {
        const res = await fetch(u, {cache: 'reload'});
        if (res.ok) { bytes += (await res.clone().blob()).size; await cache.put(u, res); }
      } catch (err) {}
      done++;
      if (done % 5 === 0 || done === urls.length) post({type:'progress', done, total: urls.length, bytes});
    }
  }));
  const keys = await cache.keys();
  let stored = 0;
  for (const k of keys) { const r = await cache.match(k); if (r) stored += (await r.blob()).size; }
  post({type:'precached', done, total: urls.length, bytes, stored, entries: keys.length});
});
