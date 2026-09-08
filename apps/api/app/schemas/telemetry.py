from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class PlayEventIn(ApiModel):
    device_key: str = Field(min_length=8, max_length=64)
    game_slug: str
    occurred_at: datetime | None = None


class LoadSampleIn(ApiModel):
    device_key: str = Field(min_length=8, max_length=64)
    game_slug: str
    time_to_play_screen_ms: int = Field(ge=0, le=600_000)
    cache_hits: int = Field(ge=0, default=0)
    cache_misses: int = Field(ge=0, default=0)
    prefetched_bytes: int = Field(ge=0, default=0)
    tier: Literal["cold", "slice", "animation", "audio", "full"]
    effective_connection_type: str | None = Field(default=None, max_length=8)
    occurred_at: datetime | None = None


class TelemetryBatchIn(ApiModel):
    """The SW buffers events and flushes them on visibilitychange."""

    plays: list[PlayEventIn] = Field(default_factory=list, max_length=100)
    loads: list[LoadSampleIn] = Field(default_factory=list, max_length=100)


class IngestResult(ApiModel):
    accepted: int
    rejected: int
