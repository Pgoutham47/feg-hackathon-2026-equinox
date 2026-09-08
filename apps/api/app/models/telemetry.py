from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlayEvent(Base):
    """Append-only: a device opened a game. Feeds the recency-weighted ranking.

    `device_key` is a random client-generated id in localStorage — no account, no
    PII, so this table stays outside any player-data retention scope.
    """

    __tablename__ = "play_event"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_key: Mapped[str] = mapped_column(String(64), index=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("game.id", ondelete="CASCADE"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    __table_args__ = (Index("ix_play_event_device_time", "device_key", "occurred_at"),)


class LoadSample(Base):
    """One measured game load. This is what proves the prefetch is still working."""

    __tablename__ = "load_sample"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_key: Mapped[str] = mapped_column(String(64), index=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("game.id", ondelete="CASCADE"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    # The metric that decides whether a player waits.
    time_to_play_screen_ms: Mapped[int] = mapped_column(Integer)
    cache_hits: Mapped[int] = mapped_column(Integer, default=0)
    cache_misses: Mapped[int] = mapped_column(Integer, default=0)
    prefetched_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    # "cold" | "slice" | "full" — which tier the SW had when the load started.
    tier: Mapped[str] = mapped_column(String(16), index=True)
    effective_connection_type: Mapped[str | None] = mapped_column(String(8))

    __table_args__ = (Index("ix_load_sample_game_time", "game_id", "occurred_at"),)


class DailyGameStat(Base):
    """Nightly rollup. Dashboards read this, never the raw event tables."""

    __tablename__ = "daily_game_stat"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    day: Mapped[datetime] = mapped_column(Date, index=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("game.id", ondelete="CASCADE"))
    plays: Mapped[int] = mapped_column(Integer, default=0)
    unique_devices: Mapped[int] = mapped_column(Integer, default=0)
    prefetch_hits: Mapped[int] = mapped_column(Integer, default=0)
    prefetch_misses: Mapped[int] = mapped_column(Integer, default=0)
    p50_ttps_ms: Mapped[int | None] = mapped_column(Integer)
    p95_ttps_ms: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (UniqueConstraint("day", "game_id", name="uq_daily_game_stat_day_game"),)
