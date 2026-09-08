"""Prefetch policy — the budget maths is the part with real money on it."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import BundleAsset, Game
from app.repositories.game import GameRepository
from app.repositories.telemetry import TelemetryRepository
from app.services.policy import PolicyService

SKINNED_BYTES = 4_400_000
SHARED_BYTES = 2_100_000


async def _seed_catalogue(session: AsyncSession, count: int = 5) -> None:
    """Mirrors the real bundle: 4.4 MB of per-game art, 2.1 MB of shared engine."""
    for i in range(count):
        game = Game(
            slug=f"game-{i}",
            name=f"Game {i}",
            provider="E-Gaming",
            skin_hue=float(i * 12),
            skin_sat=0.6,
            skin_val=0.8,
            bundle_version=f"v{i}",
            engine_version="engine1",
            popularity_prior=round(max(0.05, 1.0 - i * 0.05), 3),
        )
        session.add(game)
        await session.flush()
        session.add_all(
            [
                BundleAsset(
                    game_id=game.id,
                    bundle_version=f"v{i}",
                    path="assets/images/@1x/symbols.webp",
                    content_hash=f"sk{i}",
                    bytes=SKINNED_BYTES,
                    tier="slice",
                    is_skinned=True,
                ),
                BundleAsset(
                    game_id=game.id,
                    bundle_version=f"v{i}",
                    path="assets/core-engine.js",
                    content_hash="shared",
                    bytes=SHARED_BYTES,
                    tier="slice",
                    is_skinned=False,
                ),
            ]
        )
    await session.flush()


def _service(session: AsyncSession) -> PolicyService:
    return PolicyService(GameRepository(session), TelemetryRepository(session), get_settings())


async def test_shared_engine_is_charged_once(session: AsyncSession) -> None:
    """The regression this test exists for.

    Charging the full 6.5 MB slice to every game fits three in a 20 MB budget
    (3 x 6.5 = 19.5). The engine is identical across the catalogue and is fetched
    once, so the true cost of four games is 6.5 + 3 x 4.4 = 19.7 MB — one more
    game for the same bytes.
    """
    await _seed_catalogue(session)
    plan = await _service(session).plan(device_key=None, budget_bytes=20_000_000)

    assert len(plan.games) == 4
    assert sum(g.marginal_bytes for g in plan.games) == SHARED_BYTES + 4 * SKINNED_BYTES
    # Only the first game pays for the engine.
    assert plan.games[0].marginal_bytes == SKINNED_BYTES + SHARED_BYTES
    assert all(g.marginal_bytes == SKINNED_BYTES for g in plan.games[1:])
    # slice_bytes still reports the full slice, which is what the SW resolves.
    assert all(g.slice_bytes == SKINNED_BYTES + SHARED_BYTES for g in plan.games)


async def test_resident_games_skip_the_shared_cost(session: AsyncSession) -> None:
    """A device that already has any game cached already has the engine."""
    await _seed_catalogue(session)
    plan = await _service(session).plan(
        device_key=None, budget_bytes=20_000_000, resident=frozenset({"game-0"})
    )
    assert all(g.marginal_bytes == SKINNED_BYTES for g in plan.games)
    assert len(plan.games) == 4  # 20 MB / 4.4 MB, engine already paid


async def test_budget_of_zero_selects_nothing(session: AsyncSession) -> None:
    await _seed_catalogue(session)
    plan = await _service(session).plan(device_key=None, budget_bytes=0)
    assert plan.games == []


async def test_max_games_caps_the_plan(session: AsyncSession) -> None:
    await _seed_catalogue(session, count=20)
    plan = await _service(session).plan(device_key=None, budget_bytes=1_000_000_000)
    assert len(plan.games) == get_settings().policy_max_games


@pytest.mark.parametrize("budget", [0, 1, SKINNED_BYTES, 10**9])
async def test_plan_never_exceeds_budget(session: AsyncSession, budget: int) -> None:
    await _seed_catalogue(session)
    plan = await _service(session).plan(device_key=None, budget_bytes=budget)
    assert sum(g.marginal_bytes for g in plan.games) <= budget
