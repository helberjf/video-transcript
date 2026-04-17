from datetime import datetime

from pydantic import BaseModel, Field


class SettingsRead(BaseModel):
    openai_api_key_masked: str | None
    gemini_api_key_masked: str | None
    default_report_template_id: str | None
    whisper_model: str
    export_directory: str | None
    preferred_language: str
    max_upload_mb: int
    auto_cleanup_temp_files: bool
    updated_at: datetime | None = None


class SettingsUpdate(BaseModel):
    openai_api_key: str | None = Field(default=None, max_length=255)
    gemini_api_key: str | None = Field(default=None, max_length=255)
    default_report_template_id: str | None = None
    whisper_model: str | None = Field(default=None, min_length=2, max_length=40)
    export_directory: str | None = None
    preferred_language: str | None = Field(default=None, min_length=2, max_length=20)
    max_upload_mb: int | None = Field(default=None, ge=10, le=2048)
    auto_cleanup_temp_files: bool | None = None
