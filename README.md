# Empire of Gold

A casino lobby that opens games instantly. A service worker prefetches the 6.5 MB
"Play screen slice" of the games a player is most likely to open, cutting
time-to-Play-screen from **2.22 s to 0.20 s** on a simulated 4G connection —
without modifying the certified game bundle.

The measurements and the policy come from `prefetch-demo/`, the prototype this
project productionises. See [docs/prefetch.md](docs/prefetch.md).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web | Next.js 15 (App Router, RSC), React 19, TypeScript strict, Tailwind 4 | Catalogue is server-rendered so prefetch starts before hydration |
| Prefetch | Hand-written service worker, built from `packages/prefetch-core` | Shares policy types with the app; Workbox adds nothing here |
| API | FastAPI, Python 3.12, Pydantic v2, SQLAlchemy 2 async, Alembic | Typed end to end, OpenAPI for free |
| Data | Supabase Postgres — only | See [ADR 0001](docs/adr/0001-postgres-only.md) |
| Contract | FastAPI OpenAPI → `openapi-typescript` → `@eog/api-client` | CI fails if the client drifts from the schema |
| Build | pnpm workspaces + Turborepo; `uv` for Python | |
| Deploy | Web on Vercel, API on Fly.io (Docker), assets on CDN/object storage | |
| Quality | ruff · mypy strict · pytest · ESLint 9 flat config · Vitest · Playwright | |
| Ops | structlog JSON, Sentry, OpenTelemetry, `/healthz` + `/readyz` | |

## Layout

```
apps/
  web/                    Next.js lobby + game shell
    src/app/(lobby)/      server-rendered catalogue
    src/app/game/[slug]/  iframe game shell + load timing
    src/features/prefetch/ SW registration, plan application, tile triggers
    scripts/build-sw.mjs  bundles the worker into public/sw.js
  api/                    FastAPI service
    app/api/v1/endpoints/ HTTP layer — no SQL, no policy
    app/services/         policy, catalogue, telemetry
    app/repositories/     all SQL lives here
    app/models/           SQLAlchemy models
    app/jobs/             cron-invoked rollups
    alembic/versions/     migrations
packages/
  prefetch-core/          policy types, device key, the service worker source
  api-client/             generated OpenAPI client (schema.d.ts is git-ignored)
  ui/                     shared presentational primitives
  tsconfig/ eslint-config/
tools/
  skin-baker/             classify → bake → publish the 30 game bundles
    skin_baker/classify.py  derive prefetch tiers from a recorded load
    skin_baker/recolour.py  the palette rotation
    skin_baker/bake.py      per-game build + content hashing
    skin_baker/publish.py   object storage upload + registration
  scripts/                codegen
infra/docker/             local Postgres for development
docs/                     architecture, prefetch, bundles, runbook, ADRs
prefetch-demo/            the original prototype — kept as the reference
```

## Getting started

```bash
make setup      # pnpm install + uv sync + .env
make db-up      # local postgres (skip if you already run one, or point at Supabase)
make migrate
make seed       # 30-game catalogue, derived from the bundle in this repo
make bake       # optional: bake + publish the 30 skinned bundles locally
make codegen    # generate the typed client from the live OpenAPI schema
make dev        # web on :3000, api on :8000
```

`make db-up` needs Docker. If you already have Postgres running locally, skip it
and point `DATABASE_URL` / `DATABASE_MIGRATION_URL` at that instance instead —
`createdb empireofgold empireofgold_test` is all the setup it needs.

In development the API also mounts `/cdn`, a stand-in for the CDN that serves the
real game bundle straight out of this repo. It is never mounted in production,
where assets come from object storage.

Then `make codegen` after any API change, and `make lint test` before pushing.

### Verified locally

`make dev` serves a 30-game lobby, server-rendered. The worker registers, applies
the policy plan, and caches a 27-file slice; tiles that are cached show ⚡ READY.
`pnpm exec playwright test` asserts exactly that, on desktop and mobile Chromium.

`make bake` produces 30 genuinely distinct bundles from the one shipped bundle —
each with its own palette, name and lobby thumbnail — in about 8 s, and publishes
546 objects (44 MB shared engine, 144 MB of skin packs).

## Conventions

- The API is versioned under `/v1`. Every error is the same `{code, message, details}` envelope.
- JSON is camelCase on the wire, snake_case in Python — handled by `ApiModel`.
- Every asset URL contains a content hash and is immutable. Nothing is ever invalidated, only evicted.
- Migrations must be backward-compatible with the running code; they deploy before it.
