from enum import Enum
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import ReportFormat, TranscriptionEngine
from app.schemas.common import ORMModel


class GenerateReportRequest(BaseModel):
    upload_id: str
    template_id: str | None = None
    custom_request: str | None = None
    additional_instructions: str | None = None
    title: str = Field(default="Relatório gerado", min_length=3, max_length=160)


class ReportRenameRequest(BaseModel):
    title: str = Field(min_length=3, max_length=160)


class ReportExportExtension(str, Enum):
    MD = "md"
    TXT = "txt"
    DOCX = "docx"
    PDF = "pdf"


class ReportExportRead(BaseModel):
    extension: ReportExportExtension
    filename: str
    media_type: str
    size_bytes: int
    download_url: str


class ReportRead(ORMModel):
    id: str
    workspace_id: str = "local-workspace"
    upload_id: str
    template_id: str | None
    title: str
    request_prompt: str
    content: str
    output_format: ReportFormat
    generator_engine: TranscriptionEngine
    created_at: datetime
