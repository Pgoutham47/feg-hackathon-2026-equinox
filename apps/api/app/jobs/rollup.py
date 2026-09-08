"""Nightly rollup, written as one SQL statement.

Doing this in Postgres rather than pulling rows into Python is what lets the
stack stay Postgres-only: the aggregation never leaves the database.
"""

from sqlalchemy import text

from app.repositories.telemetry import TelemetryRepository

ROLLUP_SQL = text(
    """
    INSERT INTO daily_game_stat (
        day, game_id, plays, unique_devices,
        prefetch_hits, prefetch_misses, p50_ttps_ms, p95_ttps_ms
    )
    SELECT
        d.day,
        d.game_id,
        COALESCE(p.plays, 0),
        COALESCE(p.devices, 0),
        COALESCE(l.hits, 0),
        COALESCE(l.misses, 0),
        l.p50,
        l.p95
    FROM (
        SELECT DISTINCT (occurred_at AT TIME ZONE 'UTC')::date AS day, game_id
        FROM play_event WHERE occurred_at >= now() - interval '2 days'
        UNION
        SELECT DISTINCT (occurred_at AT TIME ZONE 'UTC')::date AS day, game_id
        FROM load_sample WHERE occurred_at >= now() - interval '2 days'
    ) d
    LEFT JOIN LATERAL (
        SELECT count(*) AS plays, count(DISTINCT device_key) AS devices
        FROM play_event e
        WHERE e.game_id = d.game_id AND (e.occurred_at AT TIME ZONE 'UTC')::date = d.day
    ) p ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            sum(cache_hits) AS hits,
            sum(cache_misses) AS misses,
            percentile_disc(0.5) WITHIN GROUP (ORDER BY time_to_play_screen_ms)::int AS p50,
            percentile_disc(0.95) WITHIN GROUP (ORDER BY time_to_play_screen_ms)::int AS p95
        FROM load_sample s
        WHERE s.game_id = d.game_id AND (s.occurred_at AT TIME ZONE 'UTC')::date = d.day
    ) l ON TRUE
    ON CONFLICT (day, game_id) DO UPDATE SET
        plays = EXCLUDED.plays,
        unique_devices = EXCLUDED.unique_devices,
        prefetch_hits = EXCLUDED.prefetch_hits,
        prefetch_misses = EXCLUDED.prefetch_misses,
        p50_ttps_ms = EXCLUDED.p50_ttps_ms,
        p95_ttps_ms = EXCLUDED.p95_ttps_ms
    """
)


async def run_daily_rollup(repo: TelemetryRepository) -> int:
    result = await repo.session.execute(ROLLUP_SQL)
    # CursorResult on an INSERT; Result is the declared supertype.
    return int(getattr(result, "rowcount", 0) or 0)
