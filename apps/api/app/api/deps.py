"""Dependency wiring — the only place services are constructed."""

import hmac
from typing import Annotated

from fastapi import Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import AppError
from app.repositories.game import GameRepository
from app.repositories.telemetry import TelemetryRepository
from app.services.bundles import BundleService
from app.services.catalogue import CatalogueService
from app.services.policy import PolicyService
from app.services.telemetry import TelemetryService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_game_repo(session: SessionDep) -> GameRepository:
    return GameRepository(session)


def get_telemetry_repo(session: SessionDep) -> TelemetryRepository:
    return TelemetryRepository(session)


def get_catalogue_service(
    repo: Annotated[GameRepository, Depends(get_game_repo)], settings: SettingsDep
) -> CatalogueService:
    return CatalogueService(repo, settings, settings.cdn_base_url)


def get_policy_service(
    games: Annotated[GameRepository, Depends(get_game_repo)],
    telemetry: Annotated[TelemetryRepository, Depends(get_telemetry_repo)],
    settings: SettingsDep,
) -> PolicyService:
    return PolicyService(games, telemetry, settings)


def get_bundle_service(session: SessionDep) -> BundleService:
    return BundleService(session)


def get_telemetry_service(
    repo: Annotated[TelemetryRepository, Depends(get_telemetry_repo)],
) -> TelemetryService:
    return TelemetryService(repo)


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"


def require_internal_key(
    settings: SettingsDep, x_internal_key: Annotated[str | None, Header()] = None
) -> None:
    """Guards /internal/*. Cron and the skin-baker are the only callers."""
    if x_internal_key is None or not hmac.compare_digest(x_internal_key, settings.internal_api_key):
        raise UnauthorizedError("Invalid or missing internal key.")
