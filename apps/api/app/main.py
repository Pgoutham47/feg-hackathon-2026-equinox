"""Application entrypoint. Wiring only — no business logic below this line."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.db import dispose_engine, init_engine
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings)
    init_engine(settings)
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.1 if settings.is_production else 1.0,
        )
    log.info("startup", environment=settings.environment)
    yield
    await dispose_engine()
    log.info("shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Empire of Gold API",
        version="1.0.0",
        description="Catalogue, prefetch policy and load telemetry for the game lobby.",
        default_response_class=ORJSONResponse,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
        lifespan=lifespan,
        # Stable operation ids → stable, readable method names in the generated client.
        generate_unique_id_function=lambda route: f"{route.tags[0]}_{route.name}",
    )

    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["content-type", "x-request-id"],
        max_age=600,
    )

    register_exception_handlers(app)
    app.include_router(api_router, prefix="/v1")

    if not settings.is_production:
        # Stands in for the CDN so `make dev` serves real game bytes. Never
        # mounted in production, where assets come from object storage.
        from app.api.dev_cdn import router as dev_cdn_router

        app.include_router(dev_cdn_router)
        log.info("dev_cdn_mounted", path="/cdn")

    return app


app = create_app()
