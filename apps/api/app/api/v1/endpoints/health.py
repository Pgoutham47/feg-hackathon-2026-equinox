from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import SessionDep, SettingsDep
from app.schemas.common import ApiModel

router = APIRouter(tags=["health"])


class Health(ApiModel):
    status: str
    environment: str


@router.get("/healthz", summary="Liveness — process is up, touches nothing")
async def healthz(settings: SettingsDep) -> Health:
    return Health(status="ok", environment=settings.environment)


@router.get("/readyz", summary="Readiness — database is reachable")
async def readyz(session: SessionDep, settings: SettingsDep) -> Health:
    await session.execute(text("SELECT 1"))
    return Health(status="ready", environment=settings.environment)
