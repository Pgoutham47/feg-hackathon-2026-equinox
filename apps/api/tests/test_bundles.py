"""Registration is how a baked catalogue becomes the live one."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import BundleAsset, Game

KEY_HEADER = {"x-internal-key": get_settings().internal_api_key}


# Realistic values: bundle/engine versions are 16-hex content hashes, which is
# what the min_length on the schema is guarding.
V1 = "a1b2c3d4e5f60718"
V2 = "b2c3d4e5f6071829"
V3 = "c3d4e5f607182930"
ENGINE = "e0e1e2e3e4e5e6e7"


def _payload(*, slug: str = "king-rhino", version: str = V1, **overrides: Any) -> dict[str, Any]:
    game: dict[str, Any] = {
        "slug": slug,
        "name": "King Rhino",
        "provider": "E-Gaming",
        "skin_hue": 230.0,
        "skin_sat": 0.7,
        "skin_val": 0.8,
        "bundle_version": version,
        "engine_version": ENGINE,
        "has_thumbnail": True,
        "assets": [
            {
                "path": "assets/images/@1x/symbols.webp",
                "bytes": 400_000,
                "content_hash": "aaaaaaaa",
                "tier": "slice",
                "is_skinned": True,
            },
            {
                "path": "assets/core-engine.js",
                "bytes": 380_000,
                "content_hash": "bbbbbbbb",
                "tier": "slice",
                "is_skinned": False,
            },
        ],
        **overrides,
    }
    return {"games": [game]}


async def test_register_creates_the_game_and_its_assets(
    client: AsyncClient, session: AsyncSession
) -> None:
    res = await client.post("/v1/internal/bundles", json=_payload(), headers=KEY_HEADER)
    assert res.status_code == 200
    body = res.json()
    assert body["gamesCreated"] == 1
    assert body["assetsWritten"] == 2
    assert body["engineVersions"] == [ENGINE]

    game = await session.scalar(select(Game).where(Game.slug == "king-rhino"))
    assert game is not None
    assert game.bundle_version == V1
    assert game.has_thumbnail is True


async def test_register_requires_the_internal_key(client: AsyncClient) -> None:
    res = await client.post("/v1/internal/bundles", json=_payload())
    assert res.status_code == 401
    assert res.json()["code"] == "unauthorized"


async def test_rebake_replaces_assets_rather_than_merging(
    client: AsyncClient, session: AsyncSession
) -> None:
    """A file dropped from the bundle must vanish from the manifest.

    Merging would leave the worker prefetching a URL that no longer exists.
    """
    await client.post("/v1/internal/bundles", json=_payload(), headers=KEY_HEADER)

    smaller = _payload(version=V2)
    smaller["games"][0]["assets"] = smaller["games"][0]["assets"][:1]
    res = await client.post("/v1/internal/bundles", json=smaller, headers=KEY_HEADER)
    assert res.json()["gamesUpdated"] == 1

    game = await session.scalar(select(Game).where(Game.slug == "king-rhino"))
    assert game is not None
    paths = list(
        await session.scalars(select(BundleAsset.path).where(BundleAsset.game_id == game.id))
    )
    assert paths == ["assets/images/@1x/symbols.webp"]
    assert game.bundle_version == V2


async def test_rebake_preserves_the_editorial_popularity_prior(
    client: AsyncClient, session: AsyncSession
) -> None:
    """popularity_prior lives in the database, not the bundle.

    A rebake resetting it would wipe the cold-start ranking for every game.
    """
    await client.post("/v1/internal/bundles", json=_payload(), headers=KEY_HEADER)
    game = await session.scalar(select(Game).where(Game.slug == "king-rhino"))
    assert game is not None
    game.popularity_prior = 0.75
    await session.flush()

    await client.post("/v1/internal/bundles", json=_payload(version=V3), headers=KEY_HEADER)
    await session.refresh(game)
    assert game.popularity_prior == 0.75
    assert game.bundle_version == V3


async def test_invalid_tier_is_rejected(client: AsyncClient) -> None:
    payload = _payload()
    payload["games"][0]["assets"][0]["tier"] = "bogus"
    res = await client.post("/v1/internal/bundles", json=payload, headers=KEY_HEADER)
    assert res.status_code == 422
    assert res.json()["code"] == "validation_error"


async def test_slug_must_be_url_safe(client: AsyncClient) -> None:
    res = await client.post(
        "/v1/internal/bundles", json=_payload(slug="Not A Slug"), headers=KEY_HEADER
    )
    assert res.status_code == 422
