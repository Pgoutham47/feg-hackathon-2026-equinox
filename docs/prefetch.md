# The prefetch layer

## What the numbers say

Measured on the prototype at a simulated 25 Mbps (`prefetch-demo/`):

| Tier | Time to Play screen | All visuals | Storage |
|---|---|---|---|
| Baseline | 2.22 s | 16.9 s | 0 |
| **Slice** | **0.20 s** | 16.8 s | **6.5 MB** |
| Slice + win animations | 0.20 s | 11.7 s | 15.6 MB |
| Slice + audio | 0.18 s | 11.9 s | 22.3 MB |
| Full precache | 0.08 s | 0.7 s | 52 MB |

**6.5 MB buys the entire Play-screen win.** The remaining 45.5 MB buys 0.12 s more.
That is why `NEXT_PUBLIC_PREFETCH_BUDGET_BYTES` defaults to the slice and why the
policy optimises games-covered rather than bytes-per-game.

There is no useful middle tier. In the slice+animations run the big-win art is
already in Cache Storage and the game still does not request it until 8.9 s — the
loader's serial request schedule is the bottleneck, not the network. Only a full
precache collapses the timeline.

## The tiers

`bundle_asset.tier` is derived, never hand-written:

- `slice` — the 27 files needed to reach the Play screen (~6.5 MB)
- `animation` — big-win art, not needed until a win lands
- `audio` — ~27 MB of ogg
- `rest` — everything else

Regenerate with `skin-baker classify --trace <har>` against a recorded cold load.
Re-record whenever the game bundle changes; a stale slice silently degrades to
baseline, which is why `daily_game_stat.p50_ttps_ms` is the alert to watch.

## Budgeting: the shared engine is paid for once

A game's 6.8 MB slice is not 6.8 MB of new bytes. Measured on this catalogue:

| | Files | Bytes |
|---|---|---|
| Skinned (per-game art) | 8 | 4.4 MB |
| Shared (engine, fonts, panel CSS) | 19 | 2.1 MB |

The shared half is identical for all 30 games, so it is fetched once and is free
for every game after the first. Charging the full slice to every game — which the
prototype's policy did — under-spends the budget by about a third:

| Budget | Charging full slice | Charging marginal cost |
|---|---|---|
| 20 MB | 2 games | **3 games** |
| 50 MB | 5 games | **8 games** |

`RankedGame` therefore reports both: `sliceBytes` is what the worker will resolve,
`marginalBytes` is what actually crosses the network. The packer budgets on the
second. `GameRepository.slice_cost_by_slug()` is where the split is computed, and
`tests/test_policy.py::test_shared_engine_is_charged_once` is the regression guard.

## The policy

```
score = recency_weighted_plays + popularity_weight × prior + stickiness_bonus
```

Recency decays exponentially with a 7-day half-life. `prior` comes from
`game_ranking`. The stickiness bonus keeps a resident game resident — evicting one
throws away bytes already spent. Games are packed greedily by score-per-byte until
the budget is gone.

Both sides use these numbers: `PolicyConfig` is served in the plan response, so
the browser can never rank against a different config than the server.

A game's prior is read as `GREATEST(game_ranking.prior, game.popularity_prior)`
via a LEFT JOIN, not straight from the view. A game added since the last refresh
is not in the view at all, and reading only the view would leave it permanently
unprefetchable until the nightly cron happened to run.

## Triggers

1. **Lobby open** — policy-ranked, ~8 games within budget
2. **Tile dwell (500 ms)** — cheapest real intent signal
3. **Pointerdown** — 80-120 ms before the tap registers as a click

## When it does not run

The provider bails out entirely on `saveData` or a 2G `effectiveType`. On a fast
link the baseline is already 0.18 s and prefetching buys nothing; on a slow or
metered one it competes with the load it is meant to help.

## Known issue inherited from the bundle

`assets/spines/@1x/book.png` is requested on every load and 404s. Harmless, but it
costs a round trip on a cold load — worth fixing in the bundle, not here.
