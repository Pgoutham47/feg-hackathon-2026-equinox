"""Prefetch ranking.

Port of the prototype's site/policy.js, with the same three terms:

    score = recency_weighted_plays + popularity_weight * prior + stickiness_bonus

Recency uses exponential decay with a configurable half-life, so a game played
this morning outranks one played every day last month. The stickiness bonus is
what stops the cache churning: a game already resident costs nothing to keep and
its eviction wastes bytes already spent.

Games are then packed greedily by score-per-byte until the device budget is
spent. Greedy is correct enough here — slice sizes are within ~1.4x of each
other, so the knapsack degenerates.
"""

import math
from datetime import UTC, datetime, timedelta
from typing import Literal

from app.core.config import Settings
from app.repositories.game import GameRepository
from app.repositories.telemetry import TelemetryRepository
from app.schemas.prefetch import PolicyConfig, PrefetchPlan, RankedGame

Reason = Literal["recent", "popular", "sticky"]

SHARED_ENGINE_ASSETS = [
    "assets/vendor-pixi.js",
    "assets/core-engine.js",
]


class PolicyService:
    def __init__(
        self,
        games: GameRepository,
        telemetry: TelemetryRepository,
        settings: Settings,
    ) -> None:
        self._games = games
        self._telemetry = telemetry
        self._cfg = settings

    async def plan(
        self,
        *,
        device_key: str | None,
        budget_bytes: int,
        resident: frozenset[str] = frozenset(),
    ) -> PrefetchPlan:
        now = datetime.now(UTC)
        costs = await self._games.slice_cost_by_slug()
        priors = await self._telemetry.global_popularity()

        recency: dict[str, float] = {}
        if device_key:
            lookback = now - timedelta(days=self._cfg.policy_half_life_days * 6)
            half_life = self._cfg.policy_half_life_days
            for slug, played_at in await self._telemetry.recent_plays_for_device(
                device_key, since=lookback
            ):
                age_days = (now - played_at).total_seconds() / 86_400
                decay = math.exp(-age_days / half_life * math.log(2))
                recency[slug] = recency.get(slug, 0.0) + decay

        scored: list[tuple[float, str, Reason]] = []
        for slug in costs:
            r = recency.get(slug, 0.0)
            p = priors.get(slug, 0.0)
            sticky = self._cfg.policy_stickiness if slug in resident else 0.0
            score = r + self._cfg.policy_popularity_weight * p + sticky
            if score <= 0:
                continue
            reason: Reason = "recent" if r > 0 else ("sticky" if sticky else "popular")
            scored.append((score, slug, reason))

        # Greedy pack by value per *marginal* byte. Density uses the skinned cost
        # because that is what adding one more game actually spends.
        scored.sort(key=lambda t: t[0] / max(costs[t[1]].skinned, 1), reverse=True)

        # The shared engine is identical across the catalogue, so it is paid for
        # by whichever game is cached first and is free for every game after it.
        shared_bytes = max((c.shared for c in costs.values()), default=0)
        shared_paid = bool(resident)

        chosen: list[RankedGame] = []
        spent = 0
        for score, slug, reason in scored:
            cost = costs[slug]
            marginal = cost.skinned + (0 if shared_paid else shared_bytes)
            # `continue`, not `break`: a cheaper game further down the ranking can
            # still fit in the budget this one just overflowed.
            if spent + marginal > budget_bytes or len(chosen) >= self._cfg.policy_max_games:
                continue
            spent += marginal
            shared_paid = True
            chosen.append(
                RankedGame(
                    game_slug=slug,
                    score=round(score, 4),
                    slice_bytes=cost.total,
                    marginal_bytes=marginal,
                    reason=reason,
                )
            )

        return PrefetchPlan(
            policy=PolicyConfig(
                half_life_days=self._cfg.policy_half_life_days,
                popularity_weight=self._cfg.policy_popularity_weight,
                stickiness=self._cfg.policy_stickiness,
                max_games=self._cfg.policy_max_games,
                budget_bytes=budget_bytes,
            ),
            games=chosen,
            shared_assets=SHARED_ENGINE_ASSETS,
            generated_at=now.isoformat(),
        )
