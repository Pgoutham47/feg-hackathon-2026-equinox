# syntax=docker/dockerfile:1.9
# Multi-stage: uv resolves deps in the builder, the runtime carries no toolchain.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm AS runtime

RUN groupadd -r app && useradd -r -g app app
WORKDIR /app

COPY --from=builder --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/v1/healthz').status==200 else 1)"

# UvicornWorker under gunicorn: process supervision + graceful reloads.
CMD ["gunicorn", "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "2", "--bind", "0.0.0.0:8000", \
     "--access-logfile", "-", "--timeout", "30", "--graceful-timeout", "20"]
