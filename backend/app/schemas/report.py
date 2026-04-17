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


class ReportRead(ORMModel):
    id: str
    upload_id: str
    template_id: str | None
    title: str
    request_prompt: str
    content: str
    output_format: ReportFormat
    generator_engine: TranscriptionEngine
    created_at: datetime
