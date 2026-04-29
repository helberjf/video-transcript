from pydantic import BaseModel, Field

from app.models.enums import ReportFormat, TranscriptionEngine
from app.schemas.report import ReportExportExtension


class FormFillRequest(BaseModel):
    template_id: str
    source_text: str = Field(min_length=3, max_length=200_000)
    title: str = Field(default="Documento preenchido", min_length=3, max_length=160)
    additional_instructions: str | None = None


class FormFillFieldsRequest(BaseModel):
    template_id: str
    title: str = Field(default="Documento preenchido", min_length=3, max_length=160)
    fields: dict[str, str] = Field(default_factory=dict)
    additional_instructions: str | None = None
    ai_polish: bool = True


class FormDetectFieldsRequest(BaseModel):
    template_id: str
    source_text: str = Field(min_length=3, max_length=200_000)
    additional_instructions: str | None = None


class FormDetectFieldsResponse(BaseModel):
    template_id: str
    fields: dict[str, str]
    generator_engine: TranscriptionEngine


class FormFillResponse(BaseModel):
    template_id: str
    title: str
    content: str
    output_format: ReportFormat
    generator_engine: TranscriptionEngine


class FormExportRequest(BaseModel):
    title: str = Field(default="Documento preenchido", min_length=1, max_length=160)
    content: str = Field(min_length=1)
    extension: ReportExportExtension
