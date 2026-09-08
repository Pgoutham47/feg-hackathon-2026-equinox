"""Tiny in-process TTL cache.

Deliberately not Redis: the only hot reads are the catalogue and the policy
rankings, both of which are small, identical for every caller and tolerate a few
seconds of staleness. Per-instance memory is enough; the authoritative rankings
live in the `game_ranking` materialized view in Postgres.
"""

import time
from collections.abc import Awaitable, Callable


class TTLCache[T]:
    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._value: T | None = None
        self._expires_at: float = 0.0

    async def get(self, loader: Callable[[], Awaitable[T]]) -> T:
        now = time.monotonic()
        if self._value is None or now >= self._expires_at:
            self._value = await loader()
            self._expires_at = now + self._ttl
        return self._value

    def invalidate(self) -> None:
        self._value = None
        self._expires_at = 0.0
