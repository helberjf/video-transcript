from datetime import datetime

from pydantic import BaseModel

from app.models.enums import ProcessingStatus, TranscriptionEngine


class TranscriptionRead(BaseModel):
    upload_id: str
    original_filename: str
    status: ProcessingStatus
    transcription_text: str | None
    transcription_engine: TranscriptionEngine
    language_detected: str | None
    duration_seconds: float | None
    updated_at: datetime
