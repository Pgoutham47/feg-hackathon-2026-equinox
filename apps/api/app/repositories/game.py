"""All Game/BundleAsset SQL lives here. Services never build queries."""

from dataclasses import dataclass

from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BundleAsset, Game


@dataclass(frozen=True, slots=True)
class SliceCost:
    """Per-game slice bytes, split into what is unique to this game and what is not."""

    skinned: int
    shared: int

    @property
    def total(self) -> int:
        return self.skinned + self.shared


class GameRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def _active(self) -> Select[tuple[Game]]:
        return select(Game).where(Game.is_active.is_(True))

    async def list_active(
        self, *, provider: str | None = None, limit: int = 100, offset: int = 0
    ) -> tuple[list[Game], int]:
        stmt = self._active()
        if provider:
            stmt = stmt.where(Game.provider == provider)
        total = await self._s.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = await self._s.scalars(stmt.order_by(Game.id).limit(limit).offset(offset))
        return list(rows), int(total or 0)

    async def get_by_slug(self, slug: str) -> Game | None:
        game: Game | None = await self._s.scalar(self._active().where(Game.slug == slug))
        return game

    async def assets_for(
        self, *, game_id: int, bundle_version: str, tiers: list[str]
    ) -> list[BundleAsset]:
        stmt = (
            select(BundleAsset)
            .where(
                BundleAsset.game_id == game_id,
                BundleAsset.bundle_version == bundle_version,
                BundleAsset.tier.in_(tiers),
            )
            .order_by(BundleAsset.bytes.desc())
        )
        return list(await self._s.scalars(stmt))

    async def slice_cost_by_slug(self) -> dict[str, SliceCost]:
        """Slice cost per game, split by who pays for it.

        `skinned` is the per-game art — the real marginal cost of adding one more
        game to the cache. `shared` is the engine, fetched once and then free for
        the rest of the catalogue. Charging both to every game (as the prototype
        did) under-spends the budget by roughly a third.
        """
        skinned = func.coalesce(
            func.sum(case((BundleAsset.is_skinned.is_(True), BundleAsset.bytes), else_=0)), 0
        )
        shared = func.coalesce(
            func.sum(case((BundleAsset.is_skinned.is_(False), BundleAsset.bytes), else_=0)), 0
        )
        stmt = (
            select(Game.slug, skinned, shared)
            .join(BundleAsset, BundleAsset.game_id == Game.id)
            .where(
                Game.is_active.is_(True),
                BundleAsset.tier == "slice",
                BundleAsset.bundle_version == Game.bundle_version,
            )
            .group_by(Game.slug)
        )
        return {
            slug: SliceCost(skinned=int(sk), shared=int(sh))
            for slug, sk, sh in (await self._s.execute(stmt)).all()
        }
