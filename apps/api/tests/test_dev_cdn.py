"""The dev CDN answers every request with Access-Control-Allow-Origin: *, so its
fallback must reach the game bundle and nothing else. Anything wider means any
page a developer visits can read the repo's .env off the dev server.
"""

from httpx import AsyncClient


async def test_serves_the_source_bundle_when_nothing_is_baked(client: AsyncClient) -> None:
    response = await client.get("/cdn/king-rhino/v1abc/assets/images/loader.webp")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


async def test_serves_the_boot_document(client: AsyncClient) -> None:
    """GameFrame loads /cdn/{slug}/{version}/index.html; it lives at the repo root."""
    response = await client.get("/cdn/king-rhino/v1abc/index.html")

    assert response.status_code == 200


async def test_never_serves_a_repo_file_outside_the_bundle(client: AsyncClient) -> None:
    for path in (".env", ".env.example", "package.json", "apps/api/pyproject.toml"):
        response = await client.get(f"/cdn/king-rhino/v1abc/{path}")
        assert response.status_code == 404, path


async def test_rejects_traversal_out_of_the_bundle(client: AsyncClient) -> None:
    """Percent-encoded, so the client cannot normalise it away before it is sent."""
    response = await client.get("/cdn/king-rhino/v1abc/assets/%2e%2e/%2e%2e/.env")

    assert response.status_code == 404


async def test_rejects_traversal_through_the_published_root(client: AsyncClient) -> None:
    response = await client.get("/cdn/%2e%2e/%2e%2e/king-rhino/v1abc/.env")

    assert response.status_code == 404
