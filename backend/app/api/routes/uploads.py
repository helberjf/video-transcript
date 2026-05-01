from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import call_with_workspace, get_workspace_id
from app.schemas.upload import (
    ProcessRequest,
    ProcessingResponse,
    RemoteImportRequest,
    UploadCreateResponse,
    UploadDetail,
    UploadListResponse,
    UploadStatsResponse,
)
from app.services.upload_service import (
    create_upload,
    create_upload_from_remote_url,
    delete_upload,
    get_upload_or_404,
    list_uploads,
    read_dashboard_stats,
)
from app.services.usage_service import consume_credits
from app.workers.processing_worker import process_upload


router = APIRouter(prefix="/api", tags=["uploads"])


@router.post("/uploads", response_model=UploadCreateResponse)
def create_upload_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> UploadCreateResponse:
    upload = call_with_workspace(create_upload, db, file, workspace_id=workspace_id)
    return UploadCreateResponse(
        id=upload.id,
        workspace_id=getattr(upload, "workspace_id", workspace_id),
        original_filename=upload.original_filename,
        file_type=upload.file_type,
        status=upload.status,
        created_at=upload.created_at,
    )


@router.post("/uploads/import", response_model=UploadCreateResponse)
def import_upload_endpoint(
    payload: RemoteImportRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> UploadCreateResponse:
    upload = call_with_workspace(create_upload_from_remote_url, db, payload.source, payload.url, workspace_id=workspace_id)
    return UploadCreateResponse(
        id=upload.id,
        workspace_id=getattr(upload, "workspace_id", workspace_id),
        original_filename=upload.original_filename,
        file_type=upload.file_type,
        status=upload.status,
        created_at=upload.created_at,
    )


@router.get("/uploads", response_model=UploadListResponse)
def list_uploads_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> UploadListResponse:
    items = call_with_workspace(list_uploads, db, workspace_id=workspace_id)
    return UploadListResponse(items=items, total=len(items))


@router.get("/uploads/{upload_id}", response_model=UploadDetail)
def get_upload_endpoint(
    upload_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> UploadDetail:
    return call_with_workspace(get_upload_or_404, db, upload_id, workspace_id=workspace_id)


@router.delete("/uploads/{upload_id}")
def delete_upload_endpoint(
    upload_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, bool]:
    call_with_workspace(delete_upload, db, upload_id, workspace_id=workspace_id)
    return {"success": True}


@router.post("/process/{upload_id}", response_model=ProcessingResponse)
def process_upload_endpoint(
    upload_id: str,
    payload: ProcessRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ProcessingResponse:
    upload = call_with_workspace(get_upload_or_404, db, upload_id, workspace_id=workspace_id)
    consume_credits(
        db,
        workspace_id,
        "media_processing_start",
        1,
        idempotency_key=f"process:{upload.id}:start",
        metadata={"upload_id": upload.id},
    )
    background_tasks.add_task(
        process_upload,
        upload.id,
        payload.language,
        payload.force_reprocess,
        payload.use_api,
        payload.whisper_model,
        payload.transcription_provider,
    )
    return ProcessingResponse(id=upload.id, status=upload.status, message="Processamento iniciado")


@router.get("/dashboard/stats", response_model=UploadStatsResponse)
def read_dashboard_stats_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> UploadStatsResponse:
    return call_with_workspace(read_dashboard_stats, db, workspace_id=workspace_id)
