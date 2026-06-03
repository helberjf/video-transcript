from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import get_workspace_id
from app.schemas.instagram import (
    InstagramAnalyzeJobStatus,
    InstagramAnalyzeRequest,
    InstagramPostReadRequest,
    InstagramPostReadResponse,
)
from app.services.instagram_ocr_service import get_analyze_job, start_analyze_job
from app.services.instagram_post_service import inspect_instagram_post


router = APIRouter(prefix="/api", tags=["instagram"])


@router.post("/instagram/read", response_model=InstagramPostReadResponse)
def read_instagram_post_endpoint(
    payload: InstagramPostReadRequest,
    _: str = Depends(get_workspace_id),
) -> InstagramPostReadResponse:
    return inspect_instagram_post(payload.url)


@router.post("/instagram/post/analyze", response_model=InstagramAnalyzeJobStatus)
def start_instagram_post_analyze(
    payload: InstagramAnalyzeRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> InstagramAnalyzeJobStatus:
    return start_analyze_job(db, payload.url, workspace_id)


@router.get("/instagram/post/analyze/{job_id}", response_model=InstagramAnalyzeJobStatus)
def read_instagram_post_analyze(
    job_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> InstagramAnalyzeJobStatus:
    return get_analyze_job(db, job_id, workspace_id)
