"""Job endpoints. Called by scheduled HTTP cron (Supabase pg_cron or Vercel Cron),
which is why the project needs no Celery and therefore no Redis broker.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_bundle_service, get_telemetry_repo, require_internal_key
from app.jobs.rollup import run_daily_rollup
from app.repositories.telemetry import TelemetryRepository
from app.schemas.bundle import BundleRegistration, RegistrationResult
from app.schemas.common import ApiModel
from app.services.bundles import BundleService

router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_key)]
)
RepoDep = Annotated[TelemetryRepository, Depends(get_telemetry_repo)]


class JobResult(ApiModel):
    job: str
    ok: bool
    detail: str | None = None


@router.post("/jobs/refresh-rankings", summary="Refresh the game_ranking view")
async def refresh_rankings(repo: RepoDep) -> JobResult:
    await repo.refresh_rankings()
    return JobResult(job="refresh-rankings", ok=True)


@router.post("/jobs/daily-rollup", summary="Roll raw events into daily_game_stat")
async def daily_rollup(repo: RepoDep) -> JobResult:
    rows = await run_daily_rollup(repo)
    return JobResult(job="daily-rollup", ok=True, detail=f"{rows} rows upserted")


@router.post("/bundles", summary="Register a baked catalogue (tools/skin-baker)")
async def register_bundles(
    payload: BundleRegistration,
    service: Annotated[BundleService, Depends(get_bundle_service)],
) -> RegistrationResult:
    return await service.register(payload)
