# Impact Case & Cost-Value Analysis

**Slipstream** — instant game launch for certified casino bundles
Team Equinox · Challenge 03 — Game Load Time: 6-8 Seconds to Near-Instant · FEG Innovation Hackathon 2026

> **Summary.** Opening a game costs a player **5.4 seconds** of dead waiting on a
> mid-tier connection, and a further ~45 MB streams in behind the Play screen
> while they play. Warming the shared bundle on the lobby takes that to
> **0.24 seconds**, and it costs about **€0.24 of extra egress per 1,000 lobby
> sessions**. Against that cost, the change breaks even at a **0.16% relative
> lift** in playing sessions. It removes roughly **2.3 hours of player waiting
> per 1,000 lobby sessions**, and it does so without altering one byte of the
> certified game.

---

## 1. The problem, in the player's terms

A player taps a tile and waits for the network. Measured on a link throttled to
**8 Mbps / 80 ms** — an ordinary mobile connection, not a bad one:

- **5.43 seconds** to reach the Play screen (5.21 MB over the wire).
- A further **~45 MB** streams in *behind* the Play screen while they play —
  the reel spines, the pay table, the free-spins music. That is where mid-game
  stutter comes from.
- A fully-loaded game is **50.83 MB across 140 requests**.

The slower the connection, the worse it gets, and the load is bandwidth-bound —
the measured 5.43 s against a theoretical 5.21 s at 8 Mbps confirms it, which
means the other rows below are a straight division and not a guess.

## 2. What the prototype changes — measured

| | Time to Play screen |
|---|---|
| Cold, no prefetch | **5,430 ms** |
| Opened *while* the prefetch is still running | **2,769 ms** |
| Opened after the prefetch finished | **243 ms** |

Measured twice per scenario against a bandwidth-limited proxy, each run in a
fresh browser profile.

The middle row matters as much as the last. A prefetch in flight does not
compete with a player who opens a game during it — it **halves** their wait,
because every game boots the same bundle, so the prefetch is already pulling the
exact files that game is about to request. Contention is impossible here by
construction.

### The same result across connection speeds

The warm column does not move, because nothing is being downloaded — it is a
disk read.

| Connection | Speed | Play screen, cold | Play screen, warm | Fully loaded, cold | Fully loaded, warm |
|---|---|---|---|---|---|
| Slow 3G | 2 Mbps | ~21.1 s | **0.24 s** | ~3 min 23 s | **0.8 s** |
| 3G | 5 Mbps | ~8.6 s | **0.24 s** | ~1 min 21 s | **0.8 s** |
| **Measured** | **8 Mbps** | **5.43 s** ✅ | **0.24 s** ✅ | ~51 s | **0.8 s** ✅ |
| 4G average | 20 Mbps | ~2.3 s | **0.24 s** | ~20 s | **0.8 s** |
| Good 4G | 50 Mbps | ~1.1 s | **0.24 s** | ~8 s | **0.8 s** |
| Wi-Fi / fibre | 100 Mbps | ~0.7 s | **0.24 s** | ~4 s | **0.8 s** |

✅ measured; the rest is 5.21 MB (or 50.83 MB) ÷ speed, plus ~0.25 s overhead.

**The distributional point:** on fibre this saves half a second; on a bad mobile
connection it saves twenty. The benefit lands hardest on the players with the
worst connections and the cheapest devices — which is the opposite of how
performance work usually distributes.

## 3. Who it helps — from the operator's own event logs

The threshold that decides who gets the expensive third pass is not a guess. It
comes from the provided sample dataset: **89 players, 13,682 game launches, 887
distinct games, 44 providers**, restricted to casino surfaces, which is our
lobby's analogue.

| The player has | Sessions | Opens a game this session |
|---|---|---|
| no history | 1,458 | **4.5%** (65) |
| 1-2 prior sessions | 1,003 | 11.4% (114) |
| 3-9 prior sessions | 1,689 | 19.1% (323) |
| 10+ prior sessions | 4,480 | **46.7%** (2,094) |
| **overall** | **8,630** | **30.1%** (2,596) |

A **tenfold spread**, and it runs the right way: the players worth 38.8 MB are
exactly the ones who identify themselves by having played before. That is what
makes a tiered prefetch defensible where a flat one would not be.

And the bet pays more than once per player: **a session that opens a game opens
5.3 of them** (median 3, p90 12). Every one boots the same bundle, so one warm
cache is reused 5.3 times per session on average.

**This is why the design is three ordered passes rather than one:**

| Pass | What | Size | Who |
|---|---|---|---|
| 1 | Visual slice — the 27 files that gate the Play screen | 6.8 MB | every visitor |
| 2 | Audio — 50 of 51 sounds, in the one format the browser decodes | 10.7 MB | every visitor, after pass 1 |
| 3 | The rest — spines, pay table, free-spins loop | 38.8 MB | returning players only |

## 4. Cost analysis

### 4.1 Bandwidth

Baseline prefetch per lobby session: **17.5 MB** on desktop Chrome — the worst
case — and 13.3 MB on iPhone.

At **€0.02/GB egress**:

| | Per 1,000 lobby sessions |
|---|---|
| Total prefetch | 17.5 GB = **€0.35** |
| Of which the player would have downloaded anyway (30.1% open a game) | 5.3 GB |
| **Genuinely additional spend** | **12.2 GB = €0.24** |

**Most of the prefetch is not additional spend.** For a player who opens a game,
these are bytes they would have downloaded regardless. Prefetching changes *when*
they arrive, not *how many*. The only genuinely new cost is prefetching for the
~70% of sessions that never launch anything.

This model is deliberately **conservative in three ways**:

1. It charges every session the full prefetch, ignoring that Cache Storage
   persists between visits — a returning player pays nothing.
2. It uses the desktop Chrome figure (17.5 MB), the largest of the four platform
   variants.
3. It ignores that a CDN edge would serve most of these bytes more cheaply than
   origin egress.

### 4.2 The third pass pays for itself in bytes

The 38.8 MB pass looks expensive until it is compared against what the status quo
spends *repeatedly* on the same player:

| The player has | Do-nothing costs, per session | 38.8 MB pays back after |
|---|---|---|
| 3-9 prior sessions | 10.8 MB (19.1% × 56.3 MB) | **3.6 sessions** |
| 10+ prior sessions | 26.3 MB (46.7% × 56.3 MB) | **1.5 sessions** |

For the cohort that is 51.9% of all sessions, the full prefetch is cheaper in
raw bytes after **two visits** — and every visit after that is free, where the
status quo pays 26.3 MB again each time.

### 4.3 Engineering and operating cost

- **Integration:** three artefacts — `public/sw.js` (plain JavaScript, no build
  step), `public/catalogue.json` (generated by a script), and one registration
  line on the lobby page.
- **Change to the game:** none. Not one byte. **No re-certification.**
- **Change to the backend:** none. No database, no API, no new service.
- **Ongoing:** one step in the release pipeline — regenerate the catalogue when
  the bundle changes (`node scripts/build-rest.mjs`, then `npm run check:bundle`).
- **Rollback:** delete one line. No migration, no data to unwind.

## 5. Value analysis — stated as a break-even, not a guessed lift

We have no conversion data, so rather than invent a conversion lift, here is the
**bar the change has to clear**.

Per 1,000 lobby sessions: ~301 open a game, each opening 5.3 games, each open
5.19 s faster.

> **27.5 seconds of dead waiting removed per playing session**
> — **138 minutes (2.3 hours) per 1,000 lobby sessions.**

Against a cost of **€0.24** per 1,000 lobby sessions:

| If one playing session is worth | Break-even needs | As a relative lift |
|---|---|---|
| €0.25 | 0.98 extra sessions per 1,000 | **0.33%** |
| €0.50 | 0.49 extra sessions per 1,000 | **0.16%** |
| €1.00 | 0.24 extra sessions per 1,000 | **0.08%** |
| €2.00 | 0.12 extra sessions per 1,000 | **0.04%** |

**A sixth of one percent** is the bar, at a €0.50 session value. That is a very
low threshold for removing 27 seconds of dead waiting per session — and the
comparison ignores the value of eliminating mid-game stutter entirely, which the
break-even does not price at all.

The operator can close this analysis exactly by substituting two numbers they
already hold: their real egress rate and their real value per playing session.

## 6. Against the challenge's own metrics

| Metric | Target | Where we are |
|---|---|---|
| Cold load p50 / p95 | under 500 ms | **243 ms per load**, measured. No percentiles — we measure every load but aggregate none |
| Launch-to-play conversion | improve | Not measured. 27.5 s of dead waiting removed per playing session is the mechanism; the lift is what the break-even in §5 prices |
| Games sampled per session | increase | Not measured. Trying a second game costs 0.24 s instead of 5.4 s, and the *n*-th game is as instant as the first |
| Perceived-load quality | improve | No spinner, no blank screen. Server-rendered tiles, game boots from disk |
| Cache hit / prefetch accuracy | maximise | **100%, by construction** — 140 of 141 requests served from cache. One shared bundle means there is no wrong game to guess |

The two we are strongest on are the two that are structural rather than tuned:
**cache hit rate is 100% because there is nothing to guess**, and **cold load is
243 ms because the load is no longer cold**. The three we cannot yet evidence
are all behavioural, and all need production traffic rather than more
engineering.

## 7. Cost-value summary

| | Status quo | This build |
|---|---|---|
| Time to Play screen @ 8 Mbps | 5.43 s | **0.24 s** (22×) |
| Fully loaded, nothing left to stream | ~51 s | **0.8 s** (64×) |
| Requests hitting the network on a warm open | 140 | **0** (1 known-missing vendor asset 404s) |
| Additional egress per 1,000 lobby sessions | — | **€0.24** |
| Player waiting removed per 1,000 lobby sessions | — | **138 minutes** |
| Break-even relative lift required | — | **0.16%** |
| Changes to the certified bundle | — | **none** |
| Re-certification required | — | **no** |

## 8. Key assumptions

1. **Games keep sharing one bundle.** This is the biggest one. All 30 titles boot
   the same certified build, which is what makes one warm cache serve the whole
   catalogue and makes prefetch accuracy 100% by construction. If the catalogue
   moved to per-game bundles, the economics invert — you would be prefetching one
   game for a player who may open a different one.
2. **Release cadence is not extreme.** A new bundle version invalidates every
   player's cache by design. The win resets at each release, so very frequent
   releases mean fewer players are ever warm.
3. **Players return.** The 38.8 MB pass is justified only by the gap between a
   cold visitor (4.5%) and a regular (46.7%).
4. **CDN egress at €0.02/GB** — substitute the operator's actual rate. The
   conclusion is insensitive to this within any plausible range; see §8.
5. **The measured speedup holds at real player connection speeds.** It was
   measured at 8 Mbps / 80 ms, twice, and the load is bandwidth-bound, so the
   other rows follow arithmetically.
6. **Caches survive between visits.** Browsers evict under storage pressure, and
   iOS Safari clears script-writable storage after 7 days without interaction —
   a player returning after 8 days is cold again. Every pass is resumable and a
   completion marker is written only for a pass that finished, so an eviction
   costs a re-fetch, never a wrong claim.
7. **A playing session has positive value to the operator.** The break-even table
   is parameterised on this rather than assuming a figure.

## 9. Sensitivity — what would change the answer

- **Egress rate.** At €0.10/GB — five times our assumption — the additional cost
  is €1.22 per 1,000 sessions and the break-even at €0.50/session is 0.81%. Still
  under one percent. The conclusion does not turn on this number.
- **Sample size.** The behavioural numbers come from **89 players over one
  month**. The signal is strong and internally consistent — a 10× monotone spread
  across four cohorts, on 8,630 sessions — but the player count is small. We would
  re-run the same analysis on full traffic before hard-coding the thresholds.
- **The launch rate is a *launch* rate.** The only casino event in the dataset is
  `casino_game_launch` — there is no spin, bet or win event. So 4.5% and 46.7%
  measure launching, which is also precisely the thing that costs the bandwidth.
  Demo-mode players (~10% of launches) pull the identical bundle, so they count.
- **The main downside risk is player mobile data.** This is why `Save-Data` and
  2G suppress the prefetch absolutely, why each pass is gated on the throughput
  the previous one actually measured (3 Mbps for audio, 5 Mbps for the full set),
  and why the largest pass is withheld until a player's own history justifies it.

## 10. Impact beyond the financial

- **Accessibility and equity of experience.** The benefit scales inversely with
  connection quality: half a second on fibre, twenty seconds on a bad mobile
  link. Players on cheap devices and poor networks gain the most.
- **Player data respected by default.** `Save-Data` and 2G switch the prefetch
  off entirely. The right image resolution and audio format are detected, so the
  worker never caches bytes the game will not ask for — guessing wrong would
  spend 10.7 MB of a player's allowance on files nothing ever decodes.
- **No regulatory surface added.** The worker only serves; it never rewrites or
  injects. The certified bundle stays byte-identical, so nothing needs
  re-certifying. See [compliance-note.md](./compliance-note.md).
- **Operational headroom.** Serving a warm player costs zero origin bytes, so
  peak-traffic egress falls exactly when it is most expensive.
- **It stacks with a CDN rather than competing.** Asset URLs are already
  content-hashed and marked `immutable` with a one-year TTL — precisely what an
  edge cache wants. A CDN makes the *first* download fast for everyone; the
  worker makes the *second* one free per player. The one constraint is that the
  edge must sit in front of the lobby's own origin, not on a separate `cdn.`
  hostname — a service worker cannot see across origins.

## 11. Alternatives considered and rejected

| Alternative | Why not |
|---|---|
| **Re-encode the audio** | The single biggest win available — 16.6 MB of ogg would fall to roughly 2.5 MB, since every sound is mastered at ~4× what a slot mix needs. It changes the bundle, and the bundle is certified. This is an operator decision, not a code change. |
| **Move the bundle to a CDN hostname** | A service worker cannot control a cross-origin iframe. The worker would go blind and re-download every prefetched byte, silently. |
| **Prefetch the whole 56.3 MB for everyone** | 22× the useful bytes for a no-history visitor, 95.5% of whom never open anything. The cohort data is what makes the tiered version defensible and this version not. |
| **Gate on `navigator.connection`** | It reported 1.55 Mbps on a link measured at 31–55 Mbps and never corrected. The worker judges throughput from bytes it actually moved. |
| **Gate on a "reached Play screen" event** | The bundle never posts a message to the parent frame, so no such signal exists. A five-second dwell timer is used instead, erring long on purpose: missing a real player only delays them to their next visit, while counting a mis-tap costs the whole download. |

## 12. What would close this analysis

Three inputs the operator holds and we do not:

1. **Actual CDN/origin egress rate**, replacing €0.02/GB.
2. **Value per playing session**, replacing the break-even table with a single
   number.
3. **The same cohort analysis on full traffic** rather than 89 players, to
   confirm the 4.5% → 46.7% spread and re-fit the two-distinct-games threshold.

A **two-week 5% traffic experiment** would produce all three, and turning the
change off is deleting one line.

---

*Figures in this document are reproducible from the repository: run
`npm run check:bundle` for the byte counts, and see
[architecture.md](./architecture.md) for how the measurements were taken and
what remains unmeasured.*
