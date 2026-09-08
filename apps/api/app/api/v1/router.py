from fastapi import APIRouter

from app.api.v1.endpoints import catalogue, health, internal, prefetch, telemetry
from app.core.errors import ErrorBody

# Declared once here so every route documents the same error envelope and the
# generated client gets a single ErrorBody type to narrow on.
ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    400: {"model": ErrorBody, "description": "Bad request"},
    401: {"model": ErrorBody, "description": "Unauthorized"},
    404: {"model": ErrorBody, "description": "Not found"},
    422: {"model": ErrorBody, "description": "Validation error"},
    500: {"model": ErrorBody, "description": "Internal server error"},
}

api_router = APIRouter(responses=ERROR_RESPONSES)
api_router.include_router(health.router)
api_router.include_router(catalogue.router)
api_router.include_router(prefetch.router)
api_router.include_router(telemetry.router)
api_router.include_router(internal.router)
