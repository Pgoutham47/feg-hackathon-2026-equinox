"""Request id + access logging. Kept separate so main.py stays a wiring file."""

import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

log = structlog.get_logger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id", "path")
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["x-request-id"] = request_id
        log.info(
            "request",
            method=request.method,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        return response
