from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, LoadSample, PlayEvent


class TelemetryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    @property
    def session(self) -> AsyncSession:
        """Exposed for jobs that run set-based SQL rather than per-row queries."""
        return self._s

    async def slug_to_id(self) -> dict[str, int]:
        rows = await self._s.execute(select(Game.slug, Game.id).where(Game.is_active.is_(True)))
        return dict(rows.all())  # type: ignore[arg-type]

    async def insert_plays(self, rows: list[dict[str, object]]) -> int:
        if not rows:
            return 0
        await self._s.execute(insert(PlayEvent), rows)
        return len(rows)

    async def insert_loads(self, rows: list[dict[str, object]]) -> int:
        if not rows:
            return 0
        await self._s.execute(insert(LoadSample), rows)
        return len(rows)

    async def recent_plays_for_device(
        self, device_key: str, *, since: datetime, limit: int = 500
    ) -> list[tuple[str, datetime]]:
        stmt = (
            select(Game.slug, PlayEvent.occurred_at)
            .join(Game, Game.id == PlayEvent.game_id)
            .where(PlayEvent.device_key == device_key, PlayEvent.occurred_at >= since)
            .order_by(PlayEvent.occurred_at.desc())
            .limit(limit)
        )
        return [(s, t) for s, t in (await self._s.execute(stmt)).all()]

    async def global_popularity(self) -> dict[str, float]:
        """Popularity prior per active game.

        LEFT JOIN rather than selecting from the view directly: a game added since
        the last REFRESH is not in `game_ranking` at all, and reading only the view
        would give it a prior of zero — making a brand-new game permanently
        unprefetchable until the nightly cron happened to run. Falling back to the
        editorial `popularity_prior` on `game` makes it prefetchable immediately and
        keeps working if the refresh job stalls.
        """
        rows = await self._s.execute(
            text(
                """
                SELECT g.slug, GREATEST(COALESCE(r.prior, 0), g.popularity_prior) AS prior
                FROM game g
                LEFT JOIN game_ranking r ON r.game_id = g.id
                WHERE g.is_active
                """
            )
        )
        return {slug: float(prior) for slug, prior in rows.all()}

    async def refresh_rankings(self) -> None:
        # CONCURRENTLY so the lobby keeps serving during the refresh.
        await self._s.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY game_ranking"))

    @staticmethod
    def now() -> datetime:
        return datetime.now(UTC)
