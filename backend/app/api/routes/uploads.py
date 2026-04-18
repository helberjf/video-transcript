from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.upload import ProcessRequest, ProcessingResponse, UploadCreateResponse, UploadDetail, UploadListResponse, UploadStatsResponse
from app.services.upload_service import create_upload, delete_upload, get_upload_or_404, list_uploads, read_dashboard_stats
from app.workers.processing_worker import process_upload


router = APIRouter(prefix="/api", tags=["uploads"])


@router.post("/uploads", response_model=UploadCreateResponse)
def create_upload_endpoint(file: UploadFile = File(...), db: Session = Depends(get_db)) -> UploadCreateResponse:
    upload = create_upload(db, file)
    return UploadCreateResponse(
        id=upload.id,
        original_filename=upload.original_filename,
        file_type=upload.file_type,
        status=upload.status,
        created_at=upload.created_at,
    )


@router.get("/uploads", response_model=UploadListResponse)
def list_uploads_endpoint(db: Session = Depends(get_db)) -> UploadListResponse:
    items = list_uploads(db)
    return UploadListResponse(items=items, total=len(items))


@router.get("/uploads/{upload_id}", response_model=UploadDetail)
def get_upload_endpoint(upload_id: str, db: Session = Depends(get_db)) -> UploadDetail:
    return get_upload_or_404(db, upload_id)


@router.delete("/uploads/{upload_id}")
def delete_upload_endpoint(upload_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    delete_upload(db, upload_id)
    return {"success": True}


@router.post("/process/{upload_id}", response_model=ProcessingResponse)
def process_upload_endpoint(
    upload_id: str,
    payload: ProcessRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ProcessingResponse:
    upload = get_upload_or_404(db, upload_id)
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
def read_dashboard_stats_endpoint(db: Session = Depends(get_db)) -> UploadStatsResponse:
    return read_dashboard_stats(db)
