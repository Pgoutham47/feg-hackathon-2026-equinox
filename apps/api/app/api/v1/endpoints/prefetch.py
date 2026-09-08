from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_policy_service
from app.schemas.prefetch import PrefetchPlan
from app.services.policy import PolicyService

router = APIRouter(prefix="/prefetch", tags=["prefetch"])

DEFAULT_BUDGET = 6_815_744  # 6.5 MB — the Play-screen slice


@router.get("/plan", summary="Which games this device should prefetch, in order")
async def get_plan(
    service: Annotated[PolicyService, Depends(get_policy_service)],
    device_key: Annotated[str | None, Query(alias="deviceKey", max_length=64)] = None,
    budget_bytes: Annotated[int, Query(alias="budgetBytes", ge=0, le=200_000_000)] = DEFAULT_BUDGET,
    resident: Annotated[
        list[str] | None, Query(description="Slugs already in Cache Storage")
    ] = None,
) -> PrefetchPlan:
    return await service.plan(
        device_key=device_key,
        budget_bytes=budget_bytes,
        resident=frozenset(resident or ()),
    )
