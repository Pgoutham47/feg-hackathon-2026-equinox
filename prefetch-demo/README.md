# Instant Game Loading — prefetch prototype

Cuts time-to-Play-screen for a 50 MB certified casino game from **2.2 s to 0.09 s**
on a simulated 4G connection, without modifying the game bundle in any way.

The catalogue is 30 distinct game bundles built from the one Empire of Gold bundle:
a shared engine plus a per-game skin pack, which is how a real operator ships a
catalogue and what makes the caching numbers below meaningful.

## Run it

```bash
python3 build_skins.py     # once — bakes the 30 game bundles (~7 s, 170 MB)
python3 serve_lobby.py
```

Then open **http://localhost:8150/casino.html**

Service workers require `localhost` or HTTPS. To open it on a phone, expose it over HTTPS:

```bash
cloudflared tunnel --url http://localhost:8150
```

## Pages

| URL | What it is |
|---|---|
| `/casino.html` | The casino lobby — the main demo. Tiles marked ⚡ READY are prefetched. |
| `/_demo.html` | Three-column measurement: baseline vs full precache vs slice precache. |
| `/predict.html` | Hit-rate simulation for the prefetch policy. |

## How it works

1. **`sw.js`** — a service worker that serves game files from Cache Storage instead of the network.
2. **`_slice.json`** — the 27 files (6.5 MB of 50 MB) needed to reach the Play screen.
   Derived by instrumenting a real load, not hand-written, so it generalises to any game.
3. **`policy.js`** — ranks games by recency-weighted play count plus a popularity prior,
   with stickiness so cached games aren't churned. Shared by the lobby and the simulation.
4. **`casino.html`** — prefetches on three triggers: lobby open (policy), tile dwell 500 ms,
   and pointerdown before the tap registers.
5. **`build_skins.py`** — bakes the catalogue. See below.

## The 30 game bundles

`build_skins.py` reads `site/games.json` and writes `site/games/<slug>/`. Each game
gets its own copy of the art that carries a game's identity — splash, symbols, reel
elements, control panel, logo, at both resolutions — palette-rotated to that game's
hue, plus `game-empireofgold-*.js` with its own `gameName`. That is 24 files, ~8 MB.

Everything else — the engine JS, 27 MB of audio, 60 MB of non-logo spines — stays in
the one shared bundle. `serve_lobby.py` resolves `/g7/assets/x.webp` to that game's
pack if it skins that file and to the shared bundle if it doesn't, so the catalogue
costs 170 MB on disk rather than 30 x 98 MB.

This split is the point, not just a disk saving: the shared engine is fetched once
and then hits cache for every other game in the catalogue, while the per-game pack is
what the prefetch policy actually has to predict and pay for.

```bash
python3 build_skins.py                      # all 30, ~7 s on 10 cores
python3 build_skins.py --only king-rhino    # one game
python3 build_skins.py --force              # ignore the up-to-date stamp
```

To change the catalogue, edit `site/games.json` (name, provider, tag, jackpot, and the
`skin` hue/sat/val) and re-run. The lobby reads the same file, so tiles and in-game art
stay in sync. Hues are spaced 12 deg apart; closer together and neighbouring games stop
reading as different games.

## Measured results (25 Mbps simulated)

| | Play screen | All visuals | Storage |
|---|---|---|---|
| Baseline | 2.22 s | 16.9 s | 0 |
| Slice | 0.20 s | 16.8 s | 6.5 MB |
| Slice + win animations | 0.20 s | 11.7 s | 15.6 MB |
| Slice + audio | 0.18 s | 11.9 s | 22.3 MB |
| Full precache | 0.08 s | 0.7 s | 52 MB |

Reproduce with `_tiers.html`, which runs all five back to back and posts to `/report`.

**The slice buys the whole Play-screen win.** 6.5 MB gets to 0.20 s; the other 45.5 MB
buys a further 0.12 s. Time-to-Play-screen is the metric that decides whether a player
waits, and it is saturated at 6.5 MB.

**No partial tier fixes "all visuals", because the loader's request schedule is the
bottleneck, not the network.** In the slice+animations run `bigwins.png` is already in
Cache Storage, and the game still does not ask for it until 8.9 s — it is serially
working through the ~36 MB it does not have. Only caching the entire bundle collapses
the timeline (0.7 s). There is no cheap middle: the two middle tiers cost 2.4x and 3.4x
the slice and recover about a third of full precache's gain.

Prefetch hit rate: 35% at 6.5 MB budget, 75% at 26 MB (simulated users).

## Notes and limits

- `RATE` in `serve_lobby.py` sets the simulated network speed. At the machine's real
  ~300 Mbps the baseline is already 0.18 s and prefetching gives no visible gain —
  this is a mobile-network optimisation.
- `/g1/`, `/g2/`… are 30 real bundles: one shared engine, a distinct skin pack each.
- The skins are palette rotations of one set of art, so they play identically and the
  painted "Empire of Gold" wordmark on the splash is the same in every game — it is
  assembled at runtime from spine slots, not a flat image, so retitling it per game
  would mean rebuilding the logo animation. The document title and in-game name do
  change. Faces recolour along with everything else; that is inherent to a hue rotation.
- Byte counters are unreliable under a service worker (the browser reports 0 bytes either way).
  Trust the worker's own hit/miss counter instead.
- Corrected: an earlier note here claimed the game downloads 16 MB of audio before it
  requests the reel symbols. The trace says otherwise — in a cold load `symbols.webp`
  completes at 5.19 s and the first `.ogg` is not requested until 8.22 s, so **no audio
  precedes the symbols**. What is ahead of them is 24.6 MB of non-audio spine art:
  `king_character.png` (4.6 MB), `BG_king_2.png` (3.4 MB), `king_character_2.png`
  (2.4 MB), `BG_king.json` (2.1 MB), `BG_king.png` (1.7 MB). The audio-deferral
  experiment did measure 2.5x worse, but the explanation given for it was wrong.
- "All visuals" is a pessimistic metric: it waits for `bigwins.png` / `bigwins_2.png`,
  4.3 MB of big-win animation that a player does not see until they actually hit a big
  win. The reel symbols land at 5.5 s on the slice tier. Before buying a bigger tier,
  decide which of those you actually need at second zero.
- Found in the shipped bundle: `assets/spines/@1x/book.png` is requested on every load and 404s.

## Files

```
build_skins.py     bakes the 30 game bundles from the one shared bundle
serve_lobby.py     static server: 25 Mbps throttle, /gN/ skin overlay, /report endpoint
site/games.json    the catalogue — read by both the build and the lobby
site/games/        the 30 skin packs (generated; safe to delete and rebuild)
site/casino.html   the lobby
site/sw.js         service worker (the caching engine)
site/policy.js     prefetch ranking policy
site/_slice.json   27 files needed for the Play screen
site/_assets.json  all 162 files
site/_game.html    game + timing instrumentation
site/_demo.html    measurement demo
site/predict.html  hit-rate simulation
site/_tiers.html   self-driving tier measurement (the table above)
predict_strategy.js  expected-wait comparison of full vs slice vs tiered allocation
site/assets        -> symlink to the original game (not duplicated)
site/index.html    -> symlink to the original game
```
