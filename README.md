# Empire of Gold

A casino lobby that opens games instantly. A service worker prefetches the
~6.3 MB "Play screen slice" of the games a player is most likely to open, so the
game boots from cache instead of the network — without modifying the certified
game bundle.

One Next.js app. No database, no second service, no build step for the worker.

```bash
npm install
npm run dev        # http://localhost:3000
```

## How it works

1. **The lobby is server-rendered** (`app/page.tsx`) so the tiles are in the HTML
   and the prefetch can start before hydration — that is most of the win.
2. **The page registers `/sw.js`** and tells it what this device has played
   recently (`components/prefetch.tsx`). That is all the page does; the worker
   owns the catalogue and the ranking.
3. **The worker ranks the catalogue** by `decayed recent plays + popularity
   prior`, packs the top games into a byte budget, and fetches their slices
   sequentially at low priority so they never contend with the foreground load.
4. **Tiles whose slice is fully cached show ⚡ READY.** The worker writes one
   marker per finished game into Cache Storage and the page reads them directly,
   so this works on the very first visit, before the worker controls the page.
5. **Opening a game boots the unmodified bundle in an iframe** on the lobby's own
   origin — the only origin a service worker can serve it from.

Two more triggers cache a single game on demand: 500 ms of hover/scroll-rest,
and `pointerdown`, which fires ~80-120 ms before a tap registers as a click.

## Layout

```
app/
  page.tsx              the lobby
  game/[slug]/page.tsx  the game shell
  cdn/[...path]/route.ts serves the bundle at the URL shape a CDN would
components/             tile, iframe shell, prefetch registration
lib/                    catalogue types + the per-device play history
public/
  catalogue.json        30 games and their Play-screen slices — the source of truth
  sw.js                 the caching engine
assets/                 the unmodified game bundle
bundle/index.html       the bundle's boot document
cdn/                    optional: 30 baked skin packs (git-ignored)
e2e/                    Playwright tests
```

## The bundle

`cdn/` holds 30 recoloured skin packs plus one shared engine, laid out as
`{slug}/{bundleVersion}/…` and `_shared/{engineVersion}/…`. Every URL contains a
content version, so nothing is ever invalidated — only evicted.

It is git-ignored and optional. Without it the route falls back to the
unmodified bundle in `assets/`, and the lobby works with the source art instead
of the 30 skins.

## Invariants

- The worker only serves; it never rewrites or injects. The certified bundle
  stays byte-identical.
- Every cached URL is content-versioned, so a stale entry is impossible.
- The bundle must be served from the lobby's own origin. A service worker cannot
  control a cross-origin iframe, so a bundle on its own host is one the worker
  never sees — it re-downloads every prefetched byte, silently.
- The play history lives in `localStorage` and is never sent anywhere, so there
  is nothing to store server-side and no consent gate to build.

## Tests

```bash
npm test           # Playwright: server rendering, worker control, caching, the shared-asset alias
npm run typecheck
```
