# ADR 0001 — Postgres only, no Redis

**Status:** accepted · **Date:** 2026-09-08

## Context

The obvious stack for this service is Postgres + Redis: Redis for the hot policy
rankings, a rate-limit counter, and a Celery broker for the rollup job. Running
Redis means a second managed service, a second failure mode, and a second thing
to keep in sync with Postgres.

## Decision

Postgres (Supabase) is the only datastore.

| Redis would have done | What we do instead |
|---|---|
| Cache the catalogue and rankings | `TTLCache` in `app/core/cache.py` — per-instance, seconds-stale, identical for every caller |
| Hold the popularity sorted set | `game_ranking` materialized view, refreshed `CONCURRENTLY` on a cron |
| Broker the rollup job | HTTP cron → `POST /v1/internal/jobs/daily-rollup`, aggregation runs as one SQL statement |
| Rate limiting | Edge rate limiting at Vercel/Cloudflare, which is where it belongs — it should reject before the request costs us a worker |
| Session state | There are no sessions; `device_key` is a client-generated id |

## Consequences

- One less service to run, monitor and pay for.
- The in-process cache is per-instance, so two API machines can serve rankings a
  few seconds apart. Acceptable: the ranking is a heuristic, and a stale plan
  costs at most one unprefetched game.
- If write volume on `load_sample` outgrows a single Postgres — the realistic
  trigger is roughly 10M samples/day — the fix is a columnar store for telemetry
  only (ClickHouse), not Redis. The rollup job is already the seam for that.
