from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import ReportFormat
from app.schemas.common import ORMModel


FormFieldType = Literal["text", "textarea", "date", "number"]


class FormFieldSpec(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)
    type: FormFieldType = "text"
    placeholder: str | None = None
    required: bool = False
    help: str | None = None


class ReportTemplateCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=255)
    category: str = Field(min_length=2, max_length=100)
    base_prompt: str = Field(min_length=10)
    example_output: str | None = Field(default=None, min_length=10)
    complementary_instructions: str | None = None
    form_fields: list[FormFieldSpec] | None = None
    output_format: ReportFormat = ReportFormat.MARKDOWN
    is_favorite: bool = False


class ReportTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, min_length=3, max_length=255)
    category: str | None = Field(default=None, min_length=2, max_length=100)
    base_prompt: str | None = Field(default=None, min_length=10)
    example_output: str | None = Field(default=None, min_length=10)
    complementary_instructions: str | None = None
    form_fields: list[FormFieldSpec] | None = None
    output_format: ReportFormat | None = None
    is_favorite: bool | None = None


class ReportTemplateRead(ORMModel):
    id: str
    workspace_id: str = "local-workspace"
    name: str
    description: str
    category: str
    base_prompt: str
    example_output: str | None
    complementary_instructions: str | None
    form_fields: list[FormFieldSpec] | None = None
    output_format: ReportFormat
    is_favorite: bool
    created_at: datetime
    updated_at: datetime


class ReportTemplateReferenceAnalysis(BaseModel):
    name: str
    description: str
    category: str
    base_prompt: str
    example_output: str | None
    complementary_instructions: str | None
    form_fields: list[FormFieldSpec] | None = None
    output_format: ReportFormat
    source_filename: str
    source_format: str
    converted_docx_filename: str | None = None
    converted_docx_base64: str | None = None


class ReportTemplateReferenceText(BaseModel):
    source_filename: str
    source_format: str
    content: str
