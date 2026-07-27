from datetime import datetime

from pydantic import Field

from app.schemas.common import ORMModel


class DocumentModelCreate(ORMModel):
    name: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    base_instructions: str | None = Field(default=None, min_length=10)
    default_context: str = Field(min_length=1)


class DocumentModelUpdate(ORMModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, min_length=3, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    base_instructions: str | None = Field(default=None, min_length=10)
    default_context: str | None = Field(default=None, min_length=1)


class DocumentModelRead(ORMModel):
    id: str
    workspace_id: str = "local-workspace"
    name: str
    description: str
    category: str
    source_filename: str
    source_mime_type: str
    source_path: str
    source_text: str
    base_instructions: str
    default_context: str
    created_at: datetime
    updated_at: datetime
