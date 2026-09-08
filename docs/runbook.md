# Runbook

## Health

| Check | Meaning |
|---|---|
| `GET /v1/healthz` | process is up |
| `GET /v1/readyz` | Postgres reachable — this is the Fly health check |
| `GET /api/health` (web) | Next runtime is up, returns the deployed commit |

## Alerts worth having

1. **`p50_ttps_ms` regression** — `daily_game_stat`. A jump from ~200 ms toward
   ~2200 ms means the slice is stale after a bundle change. Re-run
   `skin-baker classify`.
2. **Prefetch hit rate < 20%** — `prefetch_hits / (hits + misses)`. Either the
   policy is mistuned or the ranking view has stopped refreshing.
3. **`game_ranking` age** — if the refresh cron stops, plans quietly fall back to
   editorial priors and nobody notices.

## Turning prefetch off

`NEXT_PUBLIC_PREFETCH_ENABLED=false` and redeploy the web app. The worker still
registers but caches nothing new; existing caches are harmless because every URL
is content-addressed. To purge entirely, bump `VERSION` in
`packages/prefetch-core/src/sw.ts` — `activate` deletes every other cache.

## Rolling back a bad bundle

Bundle versions are immutable content hashes in the URL path. Roll back by
pointing `game.bundle_version` at the previous hash; no cache invalidation is
needed anywhere, because the old URLs were never overwritten.

## Migrations

`fly deploy` runs `alembic upgrade head` as a release command before new machines
take traffic. Migrations must therefore be backward-compatible with the currently
running code: add columns nullable, backfill in a second deploy, drop in a third.
