# Empire of Gold

A casino lobby that opens games instantly. A service worker caches the 6.8 MB
"Play screen slice" of the game bundle on the lobby, so a game boots from disk
instead of the network — without modifying the certified bundle.

One Next.js app, one game bundle. No database, no second service, no build step
for the worker.

```bash
npm install
npm run dev        # http://localhost:3000
```

## How it works

1. **The lobby is server-rendered** (`app/page.tsx`) so the tiles are in the HTML
   and the prefetch can start before hydration — that is most of the win.
2. **The page registers `/sw.js`** and asks it to cache the slice
   (`components/prefetch.tsx`). That is all the page does.
3. **The worker fetches the 27 slice files** sequentially at low priority, so
   they never contend with the load the player is actually waiting on, and
   writes one marker when it is done.
4. **The lobby says when the catalogue is ready.** The marker lives in Cache
   Storage and the page reads it directly, so this works on the very first
   visit, before the worker controls the page.
5. **Opening a game boots the unmodified bundle in an iframe** on the lobby's own
   origin — the only origin a service worker can serve it from.

Every game boots the same bundle, so one cached slice makes the whole catalogue
instant. Tiles differ by name, provider, symbol and a CSS gradient, which cost
no bytes.

## Layout

```
app/
  page.tsx              the lobby
  game/[slug]/page.tsx  the game shell
components/             tile, iframe shell, prefetch registration
lib/                    catalogue types and the server-side reader
public/
  catalogue.json        30 games + the Play-screen slice — the source of truth
  sw.js                 the caching engine
  bundle/               the game bundle, served as-is
e2e/                    Playwright tests
```

## The bundle

`public/bundle/` is the shipped game, unmodified. A rewrite in `next.config.ts`
serves it at `/cdn/{bundleVersion}/…`, where the version is a content hash of the
whole directory — so every URL is immutable and the worker never invalidates
anything, only evicts. Next serves the files statically, which also gives range
requests: the game seeks within its audio.

Regenerate `bundleVersion` and the slice sizes after changing the bundle; the
hash is what makes a redeploy replace the cache instead of serving stale bytes.

One asset 404s: `spines/@1x/book.png`, which `book.atlas` references but the
vendor never shipped. It predates this repo.

## Invariants

- The worker only serves; it never rewrites or injects. The certified bundle
  stays byte-identical.
- Every cached URL is content-versioned, so a stale entry is impossible.
- The bundle must be served from the lobby's own origin. A service worker cannot
  control a cross-origin iframe, so a bundle on its own host is one the worker
  never sees — it re-downloads every prefetched byte, silently.

## Measured

Measured once against a bandwidth-limited proxy at 8 Mbps / 80 ms RTT, each
scenario in a fresh browser profile, two runs. The proxy was scaffolding and is
not in the repo; re-measuring means rebuilding it, or using Chrome DevTools
network throttling by hand.

| | Time to Play screen |
|---|---|
| Game opened cold, no prefetch | **5,430 / 5,450 ms** (5.21 MB over the wire) |
| Game opened *while* the prefetch is still running | **2,769 / 2,769 ms** |
| Game opened after the prefetch finished | **243 / 246 ms** |

The prefetch itself takes ~7.3 s on that link.

The middle row is the one worth keeping: a prefetch in flight does not get in the
way of a game the player opens during it — it halves the wait, because every
game boots the same bundle, so the prefetch is already downloading the exact
files the game is about to ask for. Contention is impossible by construction
here; it would only become a risk if games stopped sharing a bundle.

Timings come from `responseEnd`. Bytes are only meaningful in the first row:
once a service worker serves a response the browser reports `transferSize` as 0
whether or not the worker went to the network.

## Tests

```bash
npm test           # Playwright, on its own port so a running dev server never collides
npm run typecheck
```
