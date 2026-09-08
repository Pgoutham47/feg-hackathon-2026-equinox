from app.core.config import Settings
from app.core.errors import NotFoundError
from app.repositories.game import GameRepository
from app.schemas.game import AssetRef, GameSummary, Skin, SliceManifest, Tier

TIERS: dict[str, list[str]] = {
    "slice": ["slice"],
    "animation": ["slice", "animation"],
    "audio": ["slice", "animation", "audio"],
    "full": ["slice", "animation", "audio", "rest"],
}


class CatalogueService:
    def __init__(self, games: GameRepository, settings: Settings, cdn_base_url: str) -> None:
        self._games = games
        self._cfg = settings
        self._cdn = cdn_base_url.rstrip("/")

    async def list_games(
        self, *, provider: str | None, limit: int, offset: int
    ) -> tuple[list[GameSummary], int]:
        rows, total = await self._games.list_active(provider=provider, limit=limit, offset=offset)
        return [
            GameSummary(
                id=g.id,
                slug=g.slug,
                name=g.name,
                provider=g.provider,
                tag=g.tag,
                symbol=g.symbol,
                gradient=g.gradient,
                jackpot=g.jackpot,
                skin=Skin(hue=g.skin_hue, sat=g.skin_sat, val=g.skin_val),
                bundle_version=g.bundle_version,
                thumbnail_url=(
                    f"{self._cdn}/{g.slug}/{g.bundle_version}/thumb.webp"
                    if g.has_thumbnail
                    else None
                ),
            )
            for g in rows
        ], total

    async def manifest(self, slug: str, tier: Tier) -> SliceManifest:
        game = await self._games.get_by_slug(slug)
        if game is None:
            raise NotFoundError(f"No active game with slug {slug!r}.")

        assets = await self._games.assets_for(
            game_id=game.id, bundle_version=game.bundle_version, tiers=TIERS[tier]
        )
        refs = [
            AssetRef(
                path=a.path,
                bytes=a.bytes,
                content_hash=a.content_hash,
                # Version in the path, so every URL is immutable and cacheable forever.
                url=(
                    f"{self._cdn}/{game.slug}/{game.bundle_version}/{a.path}"
                    if a.is_skinned
                    else f"{self._cdn}/_shared/{game.engine_version}/{a.path}"
                ),
            )
            for a in assets
        ]
        return SliceManifest(
            game_slug=game.slug,
            bundle_version=game.bundle_version,
            engine_version=game.engine_version,
            tier=tier,
            total_bytes=sum(r.bytes for r in refs),
            assets=refs,
        )
