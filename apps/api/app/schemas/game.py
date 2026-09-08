from decimal import Decimal
from typing import Literal

from app.schemas.common import ApiModel

# Kept as a Literal rather than a bare str so the generated TypeScript client
# gets a real union and an invalid tier is a compile error on both sides.
Tier = Literal["slice", "animation", "audio", "full"]


class Skin(ApiModel):
    hue: float
    sat: float
    val: float


class GameSummary(ApiModel):
    id: int
    slug: str
    name: str
    provider: str
    tag: str | None = None
    symbol: str | None = None
    gradient: str | None = None
    jackpot: Decimal | None = None
    skin: Skin
    bundle_version: str
    # Absolute CDN URL, or null when this game has no baked thumbnail.
    thumbnail_url: str | None = None


class AssetRef(ApiModel):
    path: str
    bytes: int
    content_hash: str
    # Absolute, immutable, CDN-hosted. The service worker caches exactly these.
    url: str


class SliceManifest(ApiModel):
    """Everything the SW needs to prefetch one game to its Play screen."""

    game_slug: str
    bundle_version: str
    engine_version: str
    tier: Tier
    total_bytes: int
    assets: list[AssetRef]
