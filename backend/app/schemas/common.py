from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import FileType, ProcessingStatus, ReportFormat, TranscriptionEngine


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UploadSummary(ORMModel):
    id: str
    original_filename: str
    file_type: FileType
    status: ProcessingStatus
    transcription_engine: TranscriptionEngine
    created_at: datetime
    updated_at: datetime


class ReportTemplateSummary(ORMModel):
    id: str
    name: str
    description: str
    category: str
    output_format: ReportFormat
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
