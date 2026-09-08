"""Register a baked catalogue.

Called only by tools/skin-baker, after it has uploaded the assets. Registration
is last on purpose: if it runs before the upload finishes, the API starts handing
out manifest URLs for objects that do not exist yet and every prefetch 404s.

The whole registration is one transaction. A partial catalogue — some games on a
new bundle_version, some on the old — would have the lobby serving manifests that
point at a mix of versions, so it is all or nothing.
"""

import structlog
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BundleAsset, Game
from app.schemas.bundle import BundleRegistration, RegistrationResult

log = structlog.get_logger(__name__)


class BundleService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def register(self, payload: BundleRegistration) -> RegistrationResult:
        # Only membership matters here — the id comes back from the upsert.
        existing = set((await self._s.scalars(select(Game.slug))).all())

        created = updated = assets_written = 0

        for entry in payload.games:
            values = {
                "slug": entry.slug,
                "name": entry.name,
                "provider": entry.provider,
                "tag": entry.tag,
                "symbol": entry.symbol,
                "gradient": entry.gradient,
                "jackpot": entry.jackpot,
                "skin_hue": entry.skin_hue,
                "skin_sat": entry.skin_sat,
                "skin_val": entry.skin_val,
                "bundle_version": entry.bundle_version,
                "engine_version": entry.engine_version,
                "has_thumbnail": entry.has_thumbnail,
                "is_active": True,
            }
            stmt = (
                insert(Game)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=[Game.slug],
                    # popularity_prior is editorial and lives in the database, not
                    # in the bundle — a rebake must never reset it.
                    set_={k: v for k, v in values.items() if k != "slug"},
                )
                .returning(Game.id)
            )
            game_id = (await self._s.execute(stmt)).scalar_one()
            if entry.slug in existing:
                updated += 1
            else:
                created += 1

            # Replace rather than merge: an asset dropped from the bundle must
            # disappear from the manifest, or the worker prefetches a dead URL.
            await self._s.execute(delete(BundleAsset).where(BundleAsset.game_id == game_id))
            await self._s.execute(
                insert(BundleAsset),
                [
                    {
                        "game_id": game_id,
                        "bundle_version": entry.bundle_version,
                        "path": asset.path,
                        "content_hash": asset.content_hash,
                        "bytes": asset.bytes,
                        "tier": asset.tier,
                        "is_skinned": asset.is_skinned,
                    }
                    for asset in entry.assets
                ],
            )
            assets_written += len(entry.assets)

        engines = sorted({g.engine_version for g in payload.games})
        if len(engines) > 1:
            # Not fatal — a staged rollout can legitimately straddle two engines —
            # but it doubles what every device downloads, so it should be visible.
            log.warning("multiple_engine_versions", versions=engines)

        log.info(
            "bundle_registered",
            games_created=created,
            games_updated=updated,
            assets=assets_written,
        )
        return RegistrationResult(
            games_created=created,
            games_updated=updated,
            assets_written=assets_written,
            engine_versions=engines,
        )
