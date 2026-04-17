from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import ReportFormat
from app.schemas.common import ORMModel


class ReportTemplateCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=255)
    category: str = Field(min_length=2, max_length=100)
    base_prompt: str = Field(min_length=10)
    complementary_instructions: str | None = None
    output_format: ReportFormat = ReportFormat.MARKDOWN
    is_favorite: bool = False


class ReportTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, min_length=3, max_length=255)
    category: str | None = Field(default=None, min_length=2, max_length=100)
    base_prompt: str | None = Field(default=None, min_length=10)
    complementary_instructions: str | None = None
    output_format: ReportFormat | None = None
    is_favorite: bool | None = None


class ReportTemplateRead(ORMModel):
    id: str
    name: str
    description: str
    category: str
    base_prompt: str
    complementary_instructions: str | None
    output_format: ReportFormat
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
