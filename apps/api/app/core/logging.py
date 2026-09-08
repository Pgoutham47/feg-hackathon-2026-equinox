"""structlog wiring: console renderer in dev, JSON in staging/production."""

import logging
import sys

import structlog

from app.core.config import Settings


def configure_logging(settings: Settings) -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stderr, level=settings.log_level)

    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if settings.log_format == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level)
        ),
        # stderr, not stdout: stdout is for program output (e.g. the OpenAPI dump).
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        cache_logger_on_first_use=True,
    )
