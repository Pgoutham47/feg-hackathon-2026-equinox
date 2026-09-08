"""Test fixtures.

Tests run against a real Postgres (Homebrew, Docker or a Supabase branch), never
SQLite: the rollup job and the `game_ranking` materialized view use Postgres-only
SQL, so a SQLite suite would pass while production breaks.

The schema is built by running the real Alembic migrations rather than
`metadata.create_all`, which (a) exercises the migrations on every run and
(b) is the only way the matview exists at all — it is DDL, not a model.
"""

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command

API_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_USER = os.environ.get("USER", "postgres")
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    f"postgresql+asyncpg://{DEFAULT_USER}@localhost:5432/empireofgold_test",
)

# Settings are read at import time by app.core.config, so point them at the test
# database before anything imports the app.
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["DATABASE_MIGRATION_URL"] = TEST_DB_URL.replace("+asyncpg", "+psycopg")
os.environ.setdefault("INTERNAL_API_KEY", "test-key-0123456789abcdef")

from app.core.db import get_session  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def migrated_database() -> None:
    cfg = Config(str(API_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
async def engine(migrated_database: None) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(TEST_DB_URL)
    yield eng
    await eng.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """One transaction per test, rolled back at the end — tests never see each other."""
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
        await s.rollback()


@pytest.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
