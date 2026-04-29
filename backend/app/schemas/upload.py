from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import FileType, ProcessingStatus, TranscriptionEngine
from app.schemas.common import ORMModel
from app.schemas.settings import TranscriptionProvider


class UploadCreateResponse(BaseModel):
    id: str
    workspace_id: str = "local-workspace"
    original_filename: str
    file_type: FileType
    status: ProcessingStatus
    created_at: datetime


RemoteMediaSource = Literal["youtube", "instagram"]


class RemoteImportRequest(BaseModel):
    source: RemoteMediaSource
    url: str = Field(..., min_length=8, max_length=2000)


class UploadDetail(ORMModel):
    id: str
    workspace_id: str = "local-workspace"
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
    use_api: bool = True
    whisper_model: str | None = Field(default=None, min_length=2, max_length=40)
    transcription_provider: TranscriptionProvider | None = None


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
