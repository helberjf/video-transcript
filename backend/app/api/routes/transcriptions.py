from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.transcription import TranscriptionRead
from app.services.upload_service import get_upload_or_404


router = APIRouter(prefix="/api", tags=["transcriptions"])


@router.get("/transcriptions/{upload_id}", response_model=TranscriptionRead)
def read_transcription(upload_id: str, db: Session = Depends(get_db)) -> TranscriptionRead:
    upload = get_upload_or_404(db, upload_id)
    return TranscriptionRead(
        upload_id=upload.id,
        original_filename=upload.original_filename,
        status=upload.status,
        transcription_text=upload.transcription_text,
        transcription_engine=upload.transcription_engine,
        language_detected=upload.language_detected,
        duration_seconds=upload.duration_seconds,
        updated_at=upload.updated_at,
    )
