from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import FileType, ProcessingStatus, TranscriptionEngine
from app.schemas.common import ORMModel


class UploadCreateResponse(BaseModel):
    id: str
    original_filename: str
    file_type: FileType
    status: ProcessingStatus
    created_at: datetime


class UploadDetail(ORMModel):
    id: str
    original_filename: str
    stored_filename: str
    file_type: FileType
    mime_type: str
    original_path: str
    converted_path: str | None
    transcription_text: str | None
    transcription_engine: TranscriptionEngine
    language_detected: str | None
    status: ProcessingStatus
    upload_size_bytes: int
    duration_seconds: float | None
    error_message: str | None
    report_count: int
    created_at: datetime
    updated_at: datetime


class ProcessRequest(BaseModel):
    language: str = "pt-BR"
    force_reprocess: bool = False


class ProcessingResponse(BaseModel):
    id: str
    status: ProcessingStatus
    message: str


class UploadListResponse(BaseModel):
    items: list[UploadDetail]
    total: int


class UploadStatsResponse(BaseModel):
    total_uploads: int
    total_reports: int
    most_used_engine: str | None
    recent_uploads: list[UploadDetail] = Field(default_factory=list)
