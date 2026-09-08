"""Registration payload written by tools/skin-baker."""

from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

AssetTier = Literal["slice", "animation", "audio", "rest"]


class AssetIn(ApiModel):
    path: str = Field(max_length=512)
    bytes: int = Field(ge=0)
    content_hash: str = Field(min_length=8, max_length=64)
    tier: AssetTier
    is_skinned: bool


class BakedGameIn(ApiModel):
    slug: str = Field(max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    name: str = Field(max_length=128)
    provider: str = Field(max_length=64)
    tag: str | None = Field(default=None, max_length=32)
    symbol: str | None = Field(default=None, max_length=8)
    gradient: str | None = Field(default=None, max_length=64)
    jackpot: Decimal | None = None
    skin_hue: float = Field(ge=0, lt=360)
    skin_sat: float = Field(ge=0, le=1)
    skin_val: float = Field(ge=0, le=1)
    bundle_version: str = Field(min_length=8, max_length=40)
    engine_version: str = Field(min_length=8, max_length=40)
    assets: list[AssetIn] = Field(min_length=1)
    has_thumbnail: bool = False


class BundleRegistration(ApiModel):
    games: list[BakedGameIn] = Field(min_length=1, max_length=500)


class RegistrationResult(ApiModel):
    games_created: int
    games_updated: int
    assets_written: int
    engine_versions: list[str]
