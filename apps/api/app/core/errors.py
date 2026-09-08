"""One error shape for the whole API, so the generated TS client has one union."""

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

log = structlog.get_logger(__name__)


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, object] | None = None


class AppError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"

    def __init__(self, message: str, details: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> ORJSONResponse:
        return ORJSONResponse(
            status_code=exc.status_code,
            content=ErrorBody(code=exc.code, message=exc.message, details=exc.details).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> ORJSONResponse:
        return ORJSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ErrorBody(
                code="validation_error",
                message="Request body failed validation.",
                details={"errors": exc.errors()},
            ).model_dump(),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> ORJSONResponse:
        return ORJSONResponse(
            status_code=exc.status_code,
            content=ErrorBody(code="http_error", message=str(exc.detail)).model_dump(),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> ORJSONResponse:
        log.exception("unhandled_error", path=request.url.path, exc_type=type(exc).__name__)
        return ORJSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorBody(code="internal_error", message="Internal server error.").model_dump(),
        )
