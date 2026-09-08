from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_catalogue_service
from app.schemas.common import Page
from app.schemas.game import GameSummary, SliceManifest, Tier
from app.services.catalogue import CatalogueService

router = APIRouter(prefix="/games", tags=["catalogue"])
ServiceDep = Annotated[CatalogueService, Depends(get_catalogue_service)]


@router.get("", summary="The lobby catalogue")
async def list_games(
    service: ServiceDep,
    response: Response,
    provider: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 60,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[GameSummary]:
    items, total = await service.list_games(provider=provider, limit=limit, offset=offset)
    # The catalogue changes only when a bundle is rebaked; let the CDN hold it.
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{slug}/manifest", summary="Asset manifest for one prefetch tier")
async def get_manifest(
    slug: str,
    service: ServiceDep,
    response: Response,
    tier: Tier = "slice",
) -> SliceManifest:
    manifest = await service.manifest(slug, tier)
    # Keyed by an immutable bundle_version, so this is safe to cache hard.
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=86400"
    return manifest
