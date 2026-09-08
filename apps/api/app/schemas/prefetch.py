from typing import Literal

from app.schemas.common import ApiModel


class PolicyConfig(ApiModel):
    """Served to the client so the browser and the server rank identically."""

    half_life_days: float
    popularity_weight: float
    stickiness: float
    max_games: int
    budget_bytes: int


class RankedGame(ApiModel):
    game_slug: str
    score: float
    # Total slice size. The worker fetches this many bytes' worth of URLs...
    slice_bytes: int
    # ...but only this many actually cross the network, because the shared engine
    # is already cached once the first game in the plan is done.
    marginal_bytes: int
    reason: Literal["recent", "popular", "sticky"]


class PrefetchPlan(ApiModel):
    policy: PolicyConfig
    games: list[RankedGame]
    # Files shared by every game — fetched once, then free for the whole catalogue.
    shared_assets: list[str]
    generated_at: str
