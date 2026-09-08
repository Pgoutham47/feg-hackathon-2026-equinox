"""Async engine + session factory.

Supabase note: point DATABASE_URL at the *session pooler* (port 6543) and disable
SQLAlchemy's own pooling with NullPool, otherwise you pool a pool and exhaust
connections under Vercel/Fly autoscaling.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import Settings, get_settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def init_engine(settings: Settings) -> AsyncEngine:
    global _engine, _sessionmaker
    pooled = ":6543" not in str(settings.database_url)
    _engine = create_async_engine(
        str(settings.database_url),
        echo=False,
        pool_pre_ping=True,
        **(
            {
                "pool_size": settings.database_pool_size,
                "max_overflow": settings.database_max_overflow,
            }
            if pooled
            else {"poolclass": NullPool}
        ),
        connect_args={
            "timeout": 10,
            "server_settings": {
                "application_name": settings.service_name,
                "statement_timeout": str(settings.database_statement_timeout_ms),
            },
        },
    )
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False, autoflush=False)
    return _engine


async def dispose_engine() -> None:
    if _engine is not None:
        await _engine.dispose()


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency. Commits on success, rolls back on any exception."""
    if _sessionmaker is None:
        init_engine(get_settings())
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
