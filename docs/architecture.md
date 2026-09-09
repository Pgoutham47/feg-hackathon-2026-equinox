# Architecture

Technical overview of Empire of Gold: components, data flow, external
dependencies and deployment assumptions. The reviewer-facing setup and run
instructions are in the [README](../README.md); the third-party disclosure is in
[dependencies.md](./dependencies.md).

## The problem in one line

A certified slot bundle is 56.3 MB. A player who taps a tile waits for it. The
bundle cannot be modified, so the only lever left is *when* those bytes move —
and the answer is: while the player is browsing the lobby, not after they have
committed to a game.

## Components

| Component | Path | Runs on | Responsibility |
|---|---|---|---|
| Lobby page | `src/app/page.tsx` | Server (RSC) | Server-renders the catalogue so tiles are in the HTML and the prefetch can start before hydration |
| Game shell | `src/app/game/[slug]/page.tsx` | Server + client | Boots the unmodified bundle in a same-origin iframe |
| Prefetch registration | `src/components/prefetch.tsx` | Client | Registers `/sw.js`, detects tier and audio format, asks the worker to cache |
| Service worker | `public/sw.js` | Worker | The caching engine: three ordered passes, throughput gating, completion markers |
| Precompression router | `src/middleware.ts` | Edge middleware | Picks `.br` / `.gz` off `Accept-Encoding` before the static layer resolves |
| Precompression server | `src/app/precompressed/[encoding]/[...path]/route.ts` | Server | Serves the twin with `Content-Encoding` set, which a static rewrite cannot do |
| Catalogue | `public/catalogue.json` | Build + runtime | Source of truth: 30 games, and the slice / audio / rest partition of the bundle |
| Game bundle | `public/bundle/` | Static | The certified third-party build, byte-identical, served at `/cdn/{bundleVersion}/…` |

## Data flow

```
browser                    Next.js                         service worker
   │                          │                                   │
   ├─ GET /  ────────────────▶│ RSC renders tiles from            │
   │◀──────── HTML with tiles │ public/catalogue.json             │
   │                          │                                   │
   ├─ register /sw.js ────────┼──────────────────────────────────▶│
   ├─ postMessage(slice) ─────┼──────────────────────────────────▶│
   │                          │◀── 27 slice files, low priority ──┤ pass 1
   │                          │    /cdn/{version}/…               │
   │◀── "catalogue ready" ────┼─── marker in Cache Storage ───────┤
   │                          │◀── 50 sounds (10.7 MB) ───────────┤ pass 2
   │                          │◀── rest (38.8 MB), returning ─────┤ pass 3
   │                          │    players only                   │
   ├─ tap a tile                                                  │
   ├─ GET /game/[slug] ──────▶│                                   │
   ├─ iframe /cdn/{version}/index.html ───────────────────────────▶│ served
   │                                                              │ from disk
```

Every request the game makes goes through `/cdn/{bundleVersion}/`, which is the
prefix the worker controls. Same origin, same URLs, so a prefetched byte and a
requested byte are the same cache entry.

## Request path for a bundle asset

1. `middleware.ts` matches `/cdn/:path*`, sets `Vary: Accept-Encoding`, and for
   a `.js` rewrites to `/precompressed/{br|gzip}/…` when the client offers it.
2. Anything else falls through to the rewrite in `next.config.ts`, which maps
   `/cdn/:version/:path*` to `/bundle/:path*` and lets Next serve it statically
   — which is also what gives range requests, since the game seeks in its audio.
3. `Cache-Control: public, max-age=31536000, immutable` on `/cdn/`, because the
   version segment is a content hash: the bytes at a URL never change.

## How it works

1. **The lobby is server-rendered** (`src/app/page.tsx`) so the tiles are in the HTML
   and the prefetch can start before hydration — that is most of the win.
2. **The page registers `/sw.js`** and asks it to cache the slice
   (`src/components/prefetch.tsx`). That is all the page does.
3. **The worker fetches the 27 slice files** sequentially at low priority, so
   they never contend with the load the player is actually waiting on, and
   writes one marker when it is done.
4. **The lobby says when the catalogue is ready.** The marker lives in Cache
   Storage and the page reads it directly, so this works on the very first
   visit, before the worker controls the page.
5. **Then, and only then, it caches the sound** (`audio` in the catalogue).
   That is a second pass on purpose — see below.
6. **For a returning player, it then caches the rest of the bundle** (`rest` in
   the catalogue). Third pass, opt-in, and the only phase that is not for
   everybody — see below.
7. **Opening a game boots the unmodified bundle in an iframe** on the lobby's own
   origin — the only origin a service worker can serve it from.

Every game boots the same bundle, so one cached slice makes the whole catalogue
instant. Tiles differ by name, provider, symbol and a CSS gradient, which cost
no bytes.

## The sound

The bundle carries 51 sounds shipped twice, as ogg and as mp3. That is 27 MB on
disk, but no player downloads both: 16.6 MB on Chrome, 11.9 MB on Safari. Images
double the same way, `@1x` against `@0.5x` — so while the directory is 100.8 MB,
a player pulls about 50 MB of it, and directory totals are the wrong number to
quote anywhere.

It hands each sound to Howler as `new Howl({ src: [ogg, mp3] })`, and Howler takes
the first format the browser says it can decode — so Chrome, Firefox and Edge
take the ogg and Safari and iOS take the mp3. `src/lib/audio.ts` runs Howler's own
`canPlayType` test rather than a user-agent lookalike, for the same reason
`src/lib/tier.ts` uses the engine's own library: the only thing that matters is that
the two agree. Guessing wrong here would spend the whole audio prefetch — 10.7 MB
of a player's bandwidth — on files nothing ever decodes.

The engine splits its config into `soundFiles` and `lazySoundFiles`, but the name
is misleading: it requests all 51 during boot, in that order. On Chrome that is
**16.6 MB, more than twice the visual slice** — measured off the boot's own
resource timings, which match the file sizes exactly.

None of it gates the Play screen, which is why the worker caches it in a second
pass, after the ready marker is written. Warming it first would spend the very
bandwidth the slice needs on bytes no player is waiting for, and the marker —
the thing that makes the lobby say "ready" — would arrive 2.5× later.

`FBGM` is deliberately left out of that pass. At 5.9 MB it is the largest single
file in the bundle, and it is the free-spins loop: most sessions never reach the
bonus round, so prefetching it on the lobby spends a third of the audio budget on
a track most players will not hear. The game still requests it at boot and the
worker still caches the response on the way past — it just is not something the
lobby pays for up front. That leaves 50 of the 51 sounds prefetched, 10.7 MB.
Adding it back is one entry in `audio`.

Two details make the cache actually hit:

- **The bundle appends `?version=` to every sound URL.** That query is a
  cache-buster for a server that does not version its paths; ours does, in the
  `/cdn/{bundleVersion}/` segment. The worker therefore keys on origin + pathname
  on both `put` and `match`, so the prefetch and the game share one entry instead
  of two. Without this the audio prefetch caches 10.7 MB that the game never
  reads.
- **Ranged requests bypass the worker.** The Cache API cannot store a 206, and
  answering one from a whole cached body ignores the range that was asked for.
  Howler decodes through Web Audio, which fetches whole files, so in practice
  this only ever catches a media element seeking.

Re-encoding is the much bigger win and is deliberately not taken: every sound is
mastered at 320 kbps MP3 / 450 kbps Vorbis, 48 kHz stereo, which is roughly four
times what a slot mix needs — `REEL SPIN` is one second of audio in 40 KB. Cutting
to ~96–128 kbps would take a player's 16.6 MB of ogg to roughly 2.5 MB, and the
27 MB on disk to about 4 MB. It would also change the bundle, and the bundle is
certified.

## The full set

The slice and the audio are 17.5 MB of a 56.3 MB bundle. The other 38.8 MB —
the spines behind the reels, the pay table, the `FBGM` free-spins loop the audio
pass leaves out — is `rest` in the catalogue, and caching it too is the
difference between a game that opens instantly and one that never loads
anything.

It is not for everybody. It is more than the slice and the audio together, and
most people who look at a casino lobby do not open a game. Event logs from 89
players over 13,682 launches put the share of sessions that open anything at:

| the player has | opens a game this session |
|---|---|
| no history | **4.5%** |
| 1-2 prior sessions | 11.4% |
| 3-9 prior sessions | 19.1% |
| 10+ prior sessions | **46.7%** |

A tenfold spread, and it runs the right way: the people worth 38.8 MB are
exactly the ones who identify themselves by having played before. So the lobby
asks for the full set only once `src/lib/recent.ts` has seen **two distinct games**
opened, which is where a visitor stops looking like a visitor. Everyone else
keeps the slice and the audio, unchanged.

The lobby shows those games back to the player: `RecentlyPlayed` puts the last
three above the catalogue. They are the tiles a returning player actually taps,
and the row is what makes the promise visible. Warming the bundle for those
three warms it for all thirty — same bundle, same bytes — so the row is a
shortcut, not a separate cache.

An open counts once the player has stayed **five seconds**, so backing straight
out of a mis-tapped tile does not spend anyone's data. That is a dwell timer and
not a 'reached the Play screen' signal because no such signal exists: the bundle
never posts a message to the parent frame, so `game:ready` in
`src/components/game-frame.tsx` has never once fired. Nothing may be gated on it
until a bundle actually sends one. Erring long is deliberate — missing a real
player only delays them to their next visit, while counting a mis-tap costs the
whole download.

The threshold matches the data's own definition, which matters: the only casino
event in those logs is `casino_game_launch`. There is no spin, bet or win event
for casino anywhere in them, so 4.5% and 46.7% are *launch* rates, and launching
is also the thing that costs the bandwidth. A demo-mode player — about 10% of
launches — pulls the identical bundle, so they count too.

The bet pays more than once per player, too: a session that opens one game opens
5.3 on average, and every one of them boots the same bundle.

The worker gates it on measured throughput as well, at a higher floor than the
audio pass (5 Mbps against 3) because the set is 3.6x larger. That is a
throughput test and not a Wi-Fi test on purpose — ordinary 4G measures well
clear of it, bad Wi-Fi does not, and the point is to read the link rather than
its label.

`rest` is *defined* as a remainder — everything on disk that the slice and the
audio do not already name — so it is generated, never hand-written:

```bash
node scripts/build-rest.mjs
```

`check:bundle` then verifies the three lists partition the bundle: no file in
two lists, none on disk in none of them. That check is what makes "full" mean
full, and it is the thing to run after any bundle change.

## The bundle

`public/bundle/` is the shipped game, unmodified. A rewrite in `next.config.ts`
serves it at `/cdn/{bundleVersion}/…`, where the version is a content hash of the
whole directory — so every URL is immutable and the worker never invalidates
anything, only evicts. Next serves the files statically, which also gives range
requests: the game seeks within its audio.

Regenerate `bundleVersion` and the slice sizes after changing the bundle, then
`node scripts/build-rest.mjs` to recompute the remainder; the hash is what makes
a redeploy replace the cache instead of serving stale bytes.

### Missing spine pages

The vendor shipped four spines without their atlas pages — `.atlas` and `.json`
are present, the `.png` files never were, in both `@1x` and `@0.5x`. They have
never been in this repo: `git log --all` on those paths is empty, and they
arrived this way in the commit that imported the bundle.

Only one of them is reachable. `book` is declared in the engine's `SECONDARY`
bundle and is the spine for reel symbol H2, so every boot 404s on
`spines/@{1,0.5}x/book.png` and logs `Error loading bundles`. The failure is
contained: the other assets in that bundle still load and the game is playable,
with only H2's animation affected. Fixing it means getting the page from the
vendor — a `.atlas` gives the page size and the region rectangles, never the
pixels.

The other three are inert. Nothing in the bundle's JavaScript or config names
`cards`, `jakpots` or `jp_jackpots`, so the game never requests them and they
produce no error. Counting `jakpots`, which is a seven-page atlas, they account
for 18 of the 20 absent pages. `jp_wins` and `multiplayer` are unreferenced too,
merely complete.

Nothing here is worth deleting. Removing the orphans would fix no request the
game actually makes, and it would break the byte-identical invariant below and
rewrite every content-hashed URL for the whole catalogue.

## Invariants

- The worker only serves; it never rewrites or injects. The certified bundle
  stays byte-identical.
- Every cached URL is content-versioned, so a stale entry is impossible.
- The bundle must be served from the lobby's own origin. A service worker cannot
  control a cross-origin iframe, so a bundle on its own host is one the worker
  never sees — it re-downloads every prefetched byte, silently.
- The phases are strictly ordered: slice, then audio, then the rest. Only the
  slice gates the Play screen, so nothing after it may delay it, and each phase
  is gated on the throughput the one before it measured.
- A completion marker is written only for a phase that finished. A partial pass
  still helps — everything it fetched is cached, and the next visit resumes —
  but the lobby must never claim a set is resident when it is not.

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

The prefetch itself takes ~7.3 s on that link. These numbers predate the audio
pass and still describe it: the audio runs only after the marker, so it moves
none of these three rows. What it changes is what happens *after* the Play
screen — 10.7 MB of the 16.6 MB the game pulls during boot is already on disk,
leaving `FBGM` as the one large file it still fetches. That has not been measured
on the throttled link; the proxy is gone.

The middle row is the one worth keeping: a prefetch in flight does not get in the
way of a game the player opens during it — it halves the wait, because every
game boots the same bundle, so the prefetch is already downloading the exact
files the game is about to ask for. Contention is impossible by construction
here; it would only become a risk if games stopped sharing a bundle.

Timings come from `responseEnd`. Bytes are only meaningful in the first row:
once a service worker serves a response the browser reports `transferSize` as 0
whether or not the worker went to the network.

The full set has not been measured on a throttled link — the proxy is gone — so
there is no timing row for it. What was checked is what it is for: with `rest`
resident, opening a game issues **141 bundle requests and 140 of them transfer
nothing**. The one exception is `book.png`, the missing spine page below, and
the 300 bytes it moves are its 404. That observation is about which requests
reach the network, which is not a property of the link, so it holds anywhere;
how much time it saves on a slow one is the part still unmeasured.


## Deployment assumptions

- **Same origin, always.** The bundle must be served from the lobby's own
  origin. A service worker cannot control a cross-origin iframe, so a bundle on
  a CDN host is one the worker never sees — it would re-download every
  prefetched byte, silently. This is the one assumption that cannot be relaxed.
- **HTTPS (or localhost).** Service workers are not available otherwise.
- **A Node runtime, not a static export.** Middleware and the precompressed
  route handler are server-side; `next export` would drop both.
- **No database, no second service, no external API.** The catalogue is a JSON
  file read at render time; player state (balance, recently played) lives in the
  browser and is demo data.
- **Storage budget.** The full set is 38.8 MB in Cache Storage on top of the
  17.5 MB every visitor gets. Browsers evict under pressure; every phase is
  resumable and every marker is written only for a pass that finished, so an
  eviction costs a re-fetch, never correctness.
- **Dev and production use separate build directories** (`.next` / `.next-prod`)
  so a running `next dev` cannot overwrite what `next start` is serving.
