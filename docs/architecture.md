# Architecture

```
                    ┌──────────────────────────────────────────┐
   player ──────────▶  Vercel edge  ·  apps/web (Next.js 15)   │
                    │  RSC-rendered lobby + /sw.js             │
                    └───────┬──────────────────────┬───────────┘
                            │ JSON (typed client)  │ asset GETs
                            ▼                      ▼
                ┌───────────────────────┐   ┌──────────────────────┐
                │ apps/api (FastAPI)    │   │ CDN / object storage │
                │ Fly.io · Docker       │   │ immutable, hashed    │
                └───────────┬───────────┘   └──────────▲───────────┘
                            │ asyncpg                  │ publish
                            ▼                          │
                ┌───────────────────────┐   ┌──────────┴───────────┐
                │ Supabase Postgres     │   │ tools/skin-baker     │
                │ catalogue · telemetry │   │ CI job               │
                │ game_ranking (matview)│   └──────────────────────┘
                └───────────────────────┘
```

## Request paths

**Lobby open.** The page is a React Server Component: `apps/web/src/app/(lobby)/page.tsx`
awaits `GET /v1/games` on the server, so tiles are in the HTML. That matters — the
prefetch cannot start until tiles exist, and a client-side catalogue fetch would
push the whole win back behind hydration.

**Prefetch.** `PrefetchProvider` registers `/sw.js`, fetches `GET /v1/prefetch/plan`
for this device, and posts the plan to the worker. The worker fetches each game's
slice manifest and caches the listed URLs sequentially at low priority.

**Game open.** `/game/[slug]` renders an iframe against the CDN. Every URL the
game requests is already in Cache Storage, so the worker answers from disk and
the Play screen paints without touching the network.

**Telemetry.** The worker and the game frame buffer events; `sendBeacon` flushes
them to `POST /v1/telemetry/batch`. A nightly cron hits `/v1/internal/jobs/*` to
refresh `game_ranking` and roll raw events into `daily_game_stat`.

## Layering rule

`endpoints → services → repositories → models`. Endpoints never write SQL,
services never build queries, repositories never contain policy. The policy
service (`app/services/policy.py`) is the only place ranking maths lives, and it
serves its own config to the client so the two sides cannot diverge.

## Why the game bundle is untouched

The bundle is certified. The service worker only serves bytes it was given; it
never rewrites, injects or reorders. That keeps the certification valid and means
the prefetch layer can be turned off with one env var
(`NEXT_PUBLIC_PREFETCH_ENABLED=false`) with no change to what the player runs.
