from httpx import AsyncClient

from app.models import BundleAsset, Game


async def _seed(session) -> None:  # type: ignore[no-untyped-def]
    game = Game(
        slug="king-rhino",
        name="King Rhino",
        provider="E-Gaming",
        skin_hue=14.0,
        skin_sat=0.6,
        skin_val=0.8,
        bundle_version="v1abc",
        engine_version="e1abc",
        popularity_prior=0.5,
    )
    session.add(game)
    await session.flush()
    session.add_all(
        [
            BundleAsset(
                game_id=game.id,
                bundle_version="v1abc",
                path="assets/images/symbols.webp",
                content_hash="h1",
                bytes=1_000_000,
                tier="slice",
                is_skinned=True,
            ),
            BundleAsset(
                game_id=game.id,
                bundle_version="v1abc",
                path="assets/core-engine.js",
                content_hash="h2",
                bytes=400_000,
                tier="slice",
                is_skinned=False,
            ),
        ]
    )
    await session.flush()


async def test_list_games_returns_active_catalogue(client: AsyncClient, session) -> None:  # type: ignore[no-untyped-def]
    await _seed(session)
    res = await client.get("/v1/games")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["slug"] == "king-rhino"
    assert body["items"][0]["skin"]["hue"] == 14.0


async def test_manifest_uses_shared_url_for_unskinned_assets(client: AsyncClient, session) -> None:  # type: ignore[no-untyped-def]
    await _seed(session)
    res = await client.get("/v1/games/king-rhino/manifest?tier=slice")
    assert res.status_code == 200
    body = res.json()
    assert body["totalBytes"] == 1_400_000
    urls = {a["path"]: a["url"] for a in body["assets"]}
    # Skinned art is per-game; the engine is shared across the whole catalogue.
    assert "/king-rhino/v1abc/" in urls["assets/images/symbols.webp"]
    assert "/_shared/e1abc/" in urls["assets/core-engine.js"]


async def test_unknown_slug_is_404_with_error_envelope(client: AsyncClient) -> None:
    res = await client.get("/v1/games/nope/manifest")
    assert res.status_code == 404
    assert res.json()["code"] == "not_found"
