from app.repositories.telemetry import TelemetryRepository
from app.schemas.telemetry import IngestResult, TelemetryBatchIn


class TelemetryService:
    """Ingest is best-effort: unknown slugs are dropped, never 4xx.

    A client whose batch is rejected retries forever and floods the endpoint; a
    client told 'accepted 9 of 10' just moves on.
    """

    def __init__(self, repo: TelemetryRepository) -> None:
        self._repo = repo

    async def ingest(self, batch: TelemetryBatchIn) -> IngestResult:
        ids = await self._repo.slug_to_id()
        now = self._repo.now()
        accepted = rejected = 0

        plays: list[dict[str, object]] = []
        for p in batch.plays:
            gid = ids.get(p.game_slug)
            if gid is None:
                rejected += 1
                continue
            plays.append(
                {"device_key": p.device_key, "game_id": gid, "occurred_at": p.occurred_at or now}
            )

        loads: list[dict[str, object]] = []
        for s in batch.loads:
            gid = ids.get(s.game_slug)
            if gid is None:
                rejected += 1
                continue
            loads.append(
                {
                    "device_key": s.device_key,
                    "game_id": gid,
                    "occurred_at": s.occurred_at or now,
                    "time_to_play_screen_ms": s.time_to_play_screen_ms,
                    "cache_hits": s.cache_hits,
                    "cache_misses": s.cache_misses,
                    "prefetched_bytes": s.prefetched_bytes,
                    "tier": s.tier,
                    "effective_connection_type": s.effective_connection_type,
                }
            )

        accepted += await self._repo.insert_plays(plays)
        accepted += await self._repo.insert_loads(loads)
        return IngestResult(accepted=accepted, rejected=rejected)
