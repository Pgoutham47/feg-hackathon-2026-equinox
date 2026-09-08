from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import get_telemetry_service
from app.schemas.telemetry import IngestResult, TelemetryBatchIn
from app.services.telemetry import TelemetryService

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/batch", status_code=status.HTTP_202_ACCEPTED, summary="Flush buffered client events")
async def ingest_batch(
    batch: TelemetryBatchIn,
    service: Annotated[TelemetryService, Depends(get_telemetry_service)],
) -> IngestResult:
    return await service.ingest(batch)
