from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import file_store
from app.core.database import get_db
from app.core.workspace import get_workspace_id
from app.models.enums import CaptureTrigger, ProcessingStatus
from app.repositories.upload_repository import UploadRepository
from app.schemas.recording import (
    CaptureRead,
    CaptureUpdateRequest,
    RecordingFinishRequest,
    RecordingStartRequest,
    RecordingStartResponse,
    SpeakerRenameRequest,
)
from app.schemas.upload import ProcessingResponse, UploadDetail
from app.services import recording_service
from app.services.meeting_service import rename_speakers
from app.services.upload_service import get_upload_or_404
from app.workers.meeting_worker import process_meeting


router = APIRouter(prefix="/api", tags=["recordings"])


def _stored_response(key: str, media_type: str, db: Session) -> Response:
    data = file_store.get(key, db)
    if data is None:
        raise HTTPException(status_code=404, detail="Arquivo nao encontrado")
    return Response(content=data, media_type=media_type, headers={"Cache-Control": "private, no-store"})


@router.post("/recordings", response_model=RecordingStartResponse)
def start_recording_endpoint(
    payload: RecordingStartRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> RecordingStartResponse:
    upload = recording_service.start_recording(db, payload.title, payload.language, payload.capture_screens, workspace_id)
    return RecordingStartResponse(id=upload.id)


@router.put("/recordings/{upload_id}/chunks/{sequence}")
async def save_chunk_endpoint(
    upload_id: str,
    sequence: int,
    request: Request,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, int]:
    data = await request.body()
    return {"sequence": recording_service.save_chunk(db, upload_id, sequence, data, workspace_id)}


@router.post("/recordings/{upload_id}/captures", response_model=CaptureRead)
def save_capture_endpoint(
    upload_id: str,
    image: UploadFile = File(...),
    offset_seconds: float = Form(0),
    trigger: CaptureTrigger = Form(CaptureTrigger.MANUAL),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
):
    return recording_service.save_capture(db, upload_id, image, offset_seconds, trigger, workspace_id)


@router.post("/recordings/{upload_id}/finish", response_model=ProcessingResponse)
def finish_recording_endpoint(
    upload_id: str,
    payload: RecordingFinishRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ProcessingResponse:
    upload = recording_service.finish_recording(
        db,
        upload_id,
        payload.analysis_mode,
        payload.duration_seconds,
        payload.energy,
        payload.markers,
        payload.has_system_audio,
        workspace_id,
    )
    background_tasks.add_task(process_meeting, upload.id)
    return ProcessingResponse(id=upload.id, status=upload.status, message="Processamento iniciado")


@router.post("/recordings/{upload_id}/reprocess", response_model=ProcessingResponse)
def reprocess_recording_endpoint(
    upload_id: str,
    payload: RecordingFinishRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ProcessingResponse:
    upload = recording_service.get_meeting_or_404(db, upload_id, workspace_id)
    upload.analysis_mode = payload.analysis_mode
    upload.status = ProcessingStatus.UPLOADED
    UploadRepository(db).save(upload)
    background_tasks.add_task(process_meeting, upload.id)
    return ProcessingResponse(id=upload.id, status=upload.status, message="Reprocessamento iniciado")


@router.get("/recordings/interrupted", response_model=list[UploadDetail])
def list_interrupted_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)):
    return recording_service.list_interrupted(db, workspace_id)


@router.get("/uploads/{upload_id}/captures", response_model=list[CaptureRead])
def list_captures_endpoint(upload_id: str, db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)):
    return recording_service.list_captures(db, upload_id, workspace_id)


@router.get("/captures/{capture_id}/image")
def capture_image_endpoint(capture_id: str, db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)):
    capture = recording_service.get_capture_or_404(db, capture_id, workspace_id)
    return _stored_response(capture.stored_path, capture.mime_type, db)


@router.patch("/captures/{capture_id}", response_model=CaptureRead)
def update_capture_endpoint(
    capture_id: str,
    payload: CaptureUpdateRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
):
    return recording_service.update_capture(db, capture_id, payload.included, workspace_id)


@router.delete("/captures/{capture_id}")
def delete_capture_endpoint(capture_id: str, db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)):
    recording_service.delete_capture(db, capture_id, workspace_id)
    return {"success": True}


@router.get("/uploads/{upload_id}/media")
def upload_media_endpoint(upload_id: str, db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)):
    upload = get_upload_or_404(db, upload_id, workspace_id)
    return _stored_response(upload.original_path, upload.mime_type, db)


@router.patch("/uploads/{upload_id}/speakers", response_model=UploadDetail)
def rename_speakers_endpoint(
    upload_id: str,
    payload: SpeakerRenameRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
):
    upload = recording_service.get_meeting_or_404(db, upload_id, workspace_id)
    rename_speakers(upload, payload.names)
    return UploadRepository(db).save(upload)
