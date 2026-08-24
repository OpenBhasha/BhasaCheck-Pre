from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.pipelines.audio_pipeline import run_pipeline

router = APIRouter()


class PipelineRequest(BaseModel):
    taskId: str
    datasetId: str
    audioUrl: str
    language: str | None = None
    callbackUrl: str
    callbackSecret: str


class PipelineResponse(BaseModel):
    status: str
    error: str | None = None


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/pipeline/process", response_model=PipelineResponse)
async def process_pipeline(
    payload: PipelineRequest,
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
) -> PipelineResponse:
    if x_internal_secret != settings.internal_service_secret:
        raise HTTPException(status_code=401, detail="Invalid internal service secret")

    try:
        await run_in_threadpool(
            run_pipeline,
            payload.taskId,
            payload.datasetId,
            payload.audioUrl,
            payload.language,
            payload.callbackUrl,
            payload.callbackSecret,
        )
    except Exception as exc:  # noqa: BLE001 - already logged/reported inside run_pipeline
        return PipelineResponse(status="failed", error=str(exc))

    return PipelineResponse(status="completed")
