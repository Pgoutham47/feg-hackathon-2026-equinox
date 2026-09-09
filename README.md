# Empire of Gold — a casino lobby that opens games instantly

| | |
|---|---|
| **Team name** | Equinox |
| **Team members** | Maheswar Sahoo · Pakala Goutham · Tigulla Geetha · Kompally Ravi Varma (4) |
| **Challenge** | **03 — Game Load Time: 6–8 Seconds to Near-Instant** |
| **Solution title** | Empire of Gold — instant game launch through a certified-bundle-safe prefetch |

> **The challenge asks:** *How might we cut game load time to around 500
> milliseconds — so choosing a game feels as fast as scrolling a feed, and
> trying a new one costs the user nothing?*
>
> **Our answer: 243 ms measured, and trying a new game costs nothing at all** —
> because all thirty games boot the same bundle, so the thirtieth game is as
> instant as the first. The certified package is never altered.

---

## 1. Problem statement

A certified slot bundle is **56.3 MB**. A player who taps a tile in the lobby
waits for all of it — measured at **5.4 seconds to the Play screen** on an
8 Mbps / 80 ms link, and worse on a real phone on a real network. That wait is
where players leave.

**The second-order cost is worse than the wait.** In a product whose core loop
is choosing and switching games, a 6-8 second penalty on every tap teaches
players not to explore. They settle into a small familiar set, and new content
never gets a fair chance. The load time is not just a latency problem — it is a
discovery problem, and it silently caps the value of the whole catalogue.

**The constraint is structural.** Games are certified third-party bundles,
contractually fixed. The solution space is everything *around* the game, and
every obvious fix inside it is closed off:

- **The bundle cannot be modified.** It is certified. Re-encoding its audio would
  cut a player's download from 16.6 MB to roughly 2.5 MB — and would invalidate
  the certification, so it is not on the table.
- **It cannot be moved to a CDN host.** A service worker cannot control a
  cross-origin iframe, so a bundle on its own host is one the worker never sees.
- **It cannot be prefetched naively.** 56.3 MB pushed at every visitor is a
  bandwidth bill for the ~95% of lobby visitors who never open a game at all.

So the only lever left is *when* the bytes move, and *for whom*.

## 2. Solution overview and key innovation

The lobby moves the bytes **while the player is browsing**, not after they have
committed to a game — without touching a byte of the certified bundle.

A service worker caches the bundle in three strictly ordered passes:

| Pass | What | Size | Who gets it |
|---|---|---|---|
| 1 | The **visual slice** — the 27 files that gate the Play screen | 6.8 MB | every visitor |
| 2 | The **audio**, 50 of 51 sounds in the one format the browser will decode | 10.7 MB | every visitor, after pass 1 finishes |
| 3 | The **rest** — spines, pay table, the free-spins loop | 38.8 MB | returning players only |

Four things make it work, and each is the answer to a way the naive version
fails:

1. **One bundle, thirty games.** Every tile boots the same certified build, so
   one cached slice makes the *whole catalogue* instant. Tiles differ by name,
   provider, symbol and a CSS gradient, which cost no bytes.
2. **The worker only serves; it never rewrites or injects.** The certified
   bundle stays byte-identical. The caching lives entirely outside it.
3. **Content-versioned URLs.** The bundle is served at `/cdn/{bundleVersion}/…`
   where the version is a content hash, so every asset URL is immutable, a stale
   entry is impossible, and the worker never has to invalidate anything.
4. **The third pass is earned, not pushed.** Event logs over 13,682 launches put
   the chance a visitor opens a game at **4.5% with no history and 46.7% at ten
   or more prior sessions** — a tenfold spread that runs the right way. So the
   38.8 MB is spent only once a player has opened two distinct games, which is
   where a visitor stops looking like a visitor.

**Measured result** (8 Mbps / 80 ms, fresh profile):

| | Time to Play screen |
|---|---|
| Cold, no prefetch | **5,430 ms** |
| Opened *while* the prefetch is still running | **2,769 ms** |
| Opened after the prefetch finished | **243 ms** |

A 22× improvement on the warm case, and — the row that matters most — a prefetch
in flight *halves* the wait rather than competing with it, because it is already
pulling the exact files the game is about to ask for.

### See it in the product, not on a slide

The lobby ships a Compare panel that runs both loads side by side, in the page,
on whatever connection the viewer actually has:

![The in-page Compare panel: 7.50s and 142 files downloaded without prefetch, against 0.90s and nothing downloaded with it — 8.3x faster](demo/screenshots/compare-load-time.png)

Read this one carefully, because it measures something different from the table
above. This is **time to fully loaded** — network-quiet, every spine and sound
in, nothing left to stream — and it runs on the machine's own link rather than
the 8 Mbps throttled one. Hence 7.50 s against 0.90 s here, where the Play
screen alone was 5.43 s against 0.24 s there.

**The seconds move with the connection. The file counts do not.** 142 files
downloaded against nothing downloaded is a property of the cache, not of the
link, so it reproduces on any device a reviewer opens it on. That invariant is
the claim; the multiplier is just what it happened to be worth on this link.

## 3. Key features / user journey

1. **The lobby is server-rendered**, so tiles are in the HTML and the prefetch
   can start before hydration. That is most of the win.
2. **The page registers `/sw.js`** and asks it to cache the slice. That is all
   the page does.
3. **The worker fetches the 27 slice files sequentially at low priority**, so
   they never contend with the load the player is actually waiting on.
4. **The lobby says when the catalogue is ready** — the marker lives in Cache
   Storage and the page reads it directly, so this works on the very first
   visit, before the worker controls the page.
5. **Then the audio**, in a second pass, so it cannot delay the Play screen.
6. **Then, for a returning player, the rest of the bundle.**
7. **Opening a game boots the unmodified bundle in an iframe** on the lobby's
   own origin — the only origin a service worker can serve it from.
8. **A recently-played row** puts the last three games above the catalogue —
   the tiles a returning player actually taps.
9. **An in-page Compare panel** runs a cold baseline against a warmed load side
   by side, so the improvement is visible without DevTools.
10. **Precompressed transport.** `.br` / `.gz` twins of the bundle scripts are
    picked off `Accept-Encoding` in middleware and served with the right
    `Content-Encoding`.
11. **The prefetch never runs on a link that cannot afford it.** `Save-Data` and
    2G suppress it outright, and each pass is gated on the throughput the one
    before it measured — 3 Mbps for the audio, 5 Mbps for the full set.

## 4. How this answers Challenge 03

### The five metrics

| Metric | How we move it | Measured? |
|---|---|---|
| **Cold load p50 / p95 — under 500 ms** | The bundle is on the device before the tap. **243 ms**, against 5,430 ms without. | Per load, yes. **Percentiles, no** — see below |
| **Launch-to-play conversion** | There is nothing left to abandon during. 27.5 s of dead waiting removed per playing session. | No — needs production traffic |
| **Games sampled per session** | Trying a second game costs **0.24 s, not 5.4 s**. One bundle serves all thirty, so the *n*-th game is as instant as the first. | Partly — the mechanism is proven, the behaviour change is not |
| **Perceived-load quality** | No spinner and no blank screen: the lobby is server-rendered, so tiles are in the HTML, and the game boots from disk. | Indirectly |
| **Cache hit / prefetch accuracy** | **100%, by construction.** | **Yes, exactly** |

### Being precise about the 500 ms

A genuinely cold load **cannot** be under 500 ms — 5.21 MB has to cross the
network to reach the Play screen, and no caching strategy changes that. We hit
243 ms by **making the load not cold**: the download happens while the player is
browsing the lobby, so by tap time there is nothing left to fetch.

So, three honest answers depending on what "cold" means:

| Reading | Number |
|---|---|
| Player has browsed the lobby, then opens any game — including one never opened before | **243 ms** ✅ |
| First-ever visit, game opened *immediately*, prefetch still in flight | **2,769 ms** — still 2× better, because the prefetch is already pulling the files that game needs |
| First-ever visit, prefetch disabled entirely | 5,430 ms |

The first row is the realistic one, and it is the one that clears the target.
We would rather state all three than quote the best.

### Prefetch accuracy is 100% by design, not by tuning

Every game boots the same certified bundle. There is no guess about *which*
game to prefetch — we cache the one bundle and are right every time. Most
prefetch systems fail exactly here, spending bytes on a game the player does not
open. **We cannot guess wrong.**

Measured on a warm open: **141 bundle requests, 140 served from cache, 0
downloaded.** The one exception is a vendor asset missing from the bundle, and
the 300 bytes are its 404.

### Where the challenge expected innovation

| Area | What we did |
|---|---|
| **Prediction and prefetching** | No prediction needed for *which* game — one shared bundle removes the guess. Prediction is applied to *whether a player is worth the bytes*, gated on the operator's own event logs (4.5% → 46.7%). |
| **Edge/CDN and caching strategy** | Content-hashed immutable URLs with a one-year TTL — exactly what an edge wants, so a CDN can go in front with no code change. CDN and service worker stack rather than compete: the CDN fixes the cold visitor, the worker fixes the returning one. The one constraint is that the edge must front the lobby's own origin, not a separate `cdn.` host. |
| **Progressive and perceived loading** | Three strictly ordered passes — only the first is on the critical path. The lobby is server-rendered so tiles never wait on hydration, and it announces catalogue readiness from a marker in Cache Storage. |
| **Lobby-to-game transitions** | The game boots in a same-origin iframe from disk. A recently-played row puts the three tiles a returning player actually taps above the catalogue. |
| **Instrumenting real vs perceived load** | `src/lib/use-frame-load.ts` measures every load: time to network-quiet, files requested, and files genuinely downloaded — counted against a Cache Storage snapshot, because `transferSize` reads 0 for anything a service worker serves and the naive measurement would report every game as fully cached. |

### Raw speed or perceived speed?

**All of it is raw speed.** There is no progress-bar trick, no skeleton screen
standing in for content, no animation covering a wait. The bytes are physically
on the device before the tap, and 140 of 141 requests never reach the network.
The only perceptual work is negative — we removed the spinner rather than
adding a nicer one.

### The guardrail

> *Speed must not bypass anything that protects the user — responsible gambling
> interstitials, reality checks, session limits and age gates stay at full
> fidelity. Certified packages must not be altered.*

- **Nothing is bypassed.** The prefetch moves *bytes*, never control flow. It
  cannot skip an interstitial, a reality check or a session limit, because it
  never touches the code path those live on — it only makes files available
  sooner on disk.
- **The certified package is not altered.** The worker only stores and serves;
  it never rewrites or injects. The bundle stays byte-identical, so nothing
  needs re-certifying. This is verified by `npm run check:bundle`.
- **Provider code and certified logic are untouched**, as are game mechanics and
  payouts — all explicitly out of scope, and all outside anything we modify.
- **Player protections are strengthened, not weakened**, in one respect: because
  the game is resident, an interstitial or limit check is no longer competing
  with a 45 MB background download for the player's bandwidth.
- The remaining protection gaps in this prototype — no age gate, no
  self-exclusion register check — are **prototype scope**, not consequences of
  the speed work, and are recorded as gaps in
  [docs/compliance-note.md](docs/compliance-note.md).

### The instrumentation gap, stated plainly

We measure **every individual load** — time, files requested, files downloaded.
Nothing aggregates them, so we have per-load numbers and **not p50/p95**.
Percentiles need a beacon and a collector over production traffic, which is the
first thing we would add. The measurements quoted here are two runs per
scenario against a throttled proxy, on desktop; **we have not yet measured on a
fleet of real devices.**

## 5. Technology stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React Server Components) |
| Language | TypeScript 5.9 (strict) |
| UI | React 19, Tailwind CSS v4 |
| Caching | The Service Worker and Cache Storage APIs — no library |
| Edge | Next.js middleware, for content-encoding negotiation |
| Game runtime | The supplied certified bundle (PixiJS, Howler, GSAP, Spine) — unmodified |
| Persistence | None. No database, no second service, no external API |

Full disclosure with licences: [docs/dependencies.md](docs/dependencies.md).

## 6. System requirements and prerequisites

- **Node.js >= 20.11.0** and npm. Nothing else — no database, no Docker, no
  service to stand up.
- **A Chromium or WebKit browser** with service workers enabled. Service workers
  require **HTTPS or `localhost`**; the app works on `localhost` out of the box.
- **Disk:** the repository is ~120 MB, most of it the game bundle under
  `public/bundle/`.
- **Optional, macOS only:** `scripts/build-art.mjs` uses `sips` to downscale
  oversized cover art. Off macOS it skips the resize and everything else still
  works — no action needed.

## 7. Installation / setup

```bash
git clone <REPOSITORY URL>
cd <repository folder>
npm install
```

That is the whole setup. There is no configuration step.

## 8. Environment variables and configuration

**No secrets, keys, tokens or credentials are required.** The prototype reads no
environment variable except `NODE_ENV`, which the tooling sets for you.
`.env.example` is the template and every value in it is optional and commented
out; the app runs with no `.env` file at all.

Configuration is all checked-in code — the rewrites in `next.config.ts`, the
catalogue and cache constants in `public/catalogue.json` and `public/sw.js`.
[config/README.md](config/README.md) says which file controls what.

## 9. How to run the prototype

**Development:**

```bash
npm run dev
```

Then open <http://localhost:3000>.

**Production build (this is the one worth demoing — the numbers above are
production numbers):**

```bash
npm run build
npm start
```

`npm run build` runs `scripts/build-art.mjs` first, which fills `public/art/`
with one cover image per game.

Dev and production write to separate build directories (`.next` and
`.next-prod`), so a running `next dev` cannot overwrite what `next start` is
serving. Both can run at once.

## 10. How to test / validate

```bash
npm run typecheck     # TypeScript, strict, no errors expected
npm run build         # production build
npm run check:bundle  # what a player actually downloads, and catalogue integrity
```

`npm run check:bundle` (`tests/check-bundle.mjs`) is the important one. It prints
what a player on each platform actually downloads, and it **fails** if the
catalogue names a file that is not on disk, records the wrong size for one, or
lets the slice, the audio and the rest stop partitioning the bundle — a file in
two lists, or on disk and in none, means `rest` is stale and "full" is a lie.

It exists because the directory total is not a download size: the bundle ships
every image at two resolutions and every sound in two formats, so the folder is
roughly twice what anybody fetches. Quote its per-player numbers, never `du`.

After any change to the bundle, regenerate the remainder and re-check:

```bash
node scripts/build-rest.mjs
npm run check:bundle
```

**To verify the behaviour by hand**, see the demo flow below — the observable
claims are the request counts and the ready marker, both visible in DevTools.

## 11. Demo instructions / demo flow

Run the production build, open <http://localhost:3000> in a **fresh browser
profile**, and open DevTools before the first load.

1. **Watch the lobby load.** The tiles are in the server-rendered HTML.
2. **Application → Service Workers**: `/sw.js` is active. **Network**: the 27
   slice files arrive at low priority. The lobby announces when the catalogue is
   ready.
3. **Open a game while the prefetch is still running.** It halves the wait
   rather than competing with it.
4. **Open a game after the prefetch has finished** — the Play screen in ~250 ms
   on a throttled link.
5. **Open two different games, five seconds each, then reload the lobby.** The
   recently-played row appears, and the third pass starts.
6. **Open a game again.** The Network panel shows **141 bundle requests, 140 of
   which transfer nothing**. The one exception is a known-missing vendor asset
   (below) and the 300 bytes are its 404.
7. **Use the in-page Compare panel** to run the cold baseline against the warmed
   load without leaving the page. This is the live side-by-side: today's
   baseline against the prefetched load, instrumented from the same measurement
   code that produces the badge over a game, so the two can never quote
   different numbers for the same load. It runs on whatever device opens it, so
   it works on a phone as-is.

The baseline half is served from `/original/{version}/…` — the same bytes as
`/cdn/`, deliberately placed outside the worker's prefix and sent with
`no-store`, so the comparison always measures a genuine first load rather than
the previous run's leftovers.

To re-measure the timings, use Chrome DevTools network throttling at 8 Mbps /
80 ms. The bandwidth proxy the original numbers came from was scaffolding and is
not in this repository.

Video, screenshots and slides: [demo/](demo/).

## 12. Known limitations, assumptions and future improvements

**Limitations**

- **The measurements are from a removed proxy.** The three timings above were
  taken once against a bandwidth-limited proxy, two runs each. The proxy is not
  in the repository, so reproducing them exactly means rebuilding it or
  throttling by hand.
- **The audio pass is unmeasured on a throttled link,** for the same reason. It
  runs after the ready marker, so it moves none of the three rows above; what it
  changes is what happens *after* the Play screen.
- **The full set has no timing row** either. What was verified is the request
  count — 141 requests, 140 transferring nothing — which is a property of the
  cache and not of the link, so it holds anywhere.
- **No p50 / p95.** `src/lib/use-frame-load.ts` measures every individual load,
  but nothing aggregates them. Percentiles need a beacon and a collector over
  production traffic. This is the single most useful thing to add next, and it
  is the one challenge metric we report as per-load rather than as a
  distribution.
- **Not yet measured on a fleet of real devices.** The numbers are from a
  throttled desktop link, two runs per scenario. The side-by-side Compare panel
  runs on whatever device opens it, so the demo is reproducible on a phone —
  but we have not collected a device matrix.
- **The vendor shipped four spines without their atlas pages.** One of them,
  `book.png`, is reachable: every boot 404s on it and logs `Error loading
  bundles`. The failure is contained — the game is playable, with only one reel
  symbol's animation affected — and fixing it means getting the file from the
  vendor. See [docs/architecture.md](docs/architecture.md#missing-spine-pages).
- **`bundleVersion` cannot be regenerated.** It is a content hash of the bundle,
  but the recipe that produced the committed value is not in this repository.
  `check:bundle` does not verify it.
- **`game:ready` has never fired.** The bundle never posts a message to the
  parent frame, so the returning-player signal is a five-second dwell timer
  rather than a real "reached the Play screen" event. Nothing may be gated on
  that message until a bundle actually sends one.
- **Lobby state is demo data.** Balances, jackpots and player names in
  `src/lib/demo-data.ts` are synthetic. There is no account system, no wallet
  and no real money anywhere in this prototype.
- **Regulatory controls are out of prototype scope.** No age gate, no
  self-exclusion register check, no KYC/AML onboarding, and no storage notice or
  opt-out for the large pre-cache. These are recorded as gaps, not presented as
  controls — see [docs/compliance-note.md](docs/compliance-note.md).

**Assumptions**

- The bundle is served from the lobby's own origin over HTTPS. This one cannot
  be relaxed — see [docs/architecture.md](docs/architecture.md).
- A Node runtime, not a static export: middleware and the precompressed route
  handler are server-side.
- Browsers may evict Cache Storage under pressure. Every pass is resumable and a
  completion marker is only written for a pass that finished, so an eviction
  costs a re-fetch, never a wrong claim.

**Future improvements**

- Re-measure on the throttled link, with the audio and full-set passes included,
  and keep the harness in the repository this time.
- Ask the vendor for the four missing atlas pages.
- Ask the vendor to emit a real ready message from the bundle, and replace the
  dwell timer with it.
- Re-encoding the audio is the single biggest win available — 16.6 MB to roughly
  2.5 MB — and needs the bundle to be recertified, so it is an operator
  decision, not a code change.

## 13. Repository layout

```
README.md                  this file
LICENSE                    proprietary; third-party components under their own terms
.env.example               environment template (no secrets required)

src/
  app/
    page.tsx               the lobby, server-rendered
    game/[slug]/page.tsx   the game shell
    precompressed/         serves the .br / .gz twins with Content-Encoding set
  components/              tiles, iframe shell, prefetch registration, dashboard
  lib/                     catalogue types and reader, tier and audio-format
                           detection, the recently-played store
  middleware.ts            picks the precompressed twin off Accept-Encoding

public/
  catalogue.json           30 games, the slice, the audio and the rest — source of truth
  sw.js                    the caching engine
  bundle/                  the certified game bundle, served as-is
  art/                     generated cover images

tests/
  check-bundle.mjs         what a player downloads; fails on catalogue drift

scripts/
  build-art.mjs            fills public/art/ from assets/art-src/
  build-rest.mjs           regenerates `rest`, which is defined as a remainder

assets/art-src/            source cover thumbnails (build input, never served)
config/                    where each piece of configuration lives
docs/                      architecture and dependency disclosure
demo/                      video link, screenshots, presentation
```

## 14. Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Components, data flow, the three caching passes in detail, the bundle, invariants, measurements, deployment assumptions |
| [docs/dependencies.md](docs/dependencies.md) | Third-party libraries, the certified bundle's embedded runtimes, artwork, data provenance, AI-assistance disclosure |
| [config/README.md](config/README.md) | Which file controls what; why there is nothing to configure |
| [demo/demo-video-link.md](demo/demo-video-link.md) | Demo video link and what it shows |
| [docs/compliance-note.md](docs/compliance-note.md) | EU regulatory baseline (GDPR, ePrivacy, AML, eIDAS, AI Act, accessibility), responsible-gambling posture, the Croatia/PSK national layer, and the known gaps |
| [docs/impact-case.md](docs/impact-case.md) | D3 impact case: measured speedup, the cohort data behind the tiering, bandwidth cost model, break-even analysis, assumptions and sensitivity |

## Security note

This repository contains **no credentials, API keys, tokens, secrets, VPN
details, real customer data, real player data or personal data**. There is no
`process.env` read anywhere except `NODE_ENV`, and `.env` files are excluded in
`.gitignore`. All lobby state is synthetic demo data.
