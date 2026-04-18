from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


TranscriptionProvider = Literal["openai", "gemini", "whisper"]
ReportProvider = Literal["openai", "claude", "gemini", "local"]


class SettingsRead(BaseModel):
    openai_api_key_masked: str | None
    gemini_api_key_masked: str | None
    claude_api_key_masked: str | None
    default_report_template_id: str | None
    whisper_model: str
    transcription_provider_order: list[TranscriptionProvider]
    report_provider_order: list[ReportProvider]
    export_directory: str | None
    preferred_language: str
    max_upload_mb: int
    auto_cleanup_temp_files: bool
    updated_at: datetime | None = None


class SettingsUpdate(BaseModel):
    openai_api_key: str | None = Field(default=None, max_length=255)
    gemini_api_key: str | None = Field(default=None, max_length=255)
    claude_api_key: str | None = Field(default=None, max_length=255)
    default_report_template_id: str | None = None
    whisper_model: str | None = Field(default=None, min_length=2, max_length=40)
    transcription_provider_order: list[TranscriptionProvider] | None = None
    report_provider_order: list[ReportProvider] | None = None
    export_directory: str | None = None
    preferred_language: str | None = Field(default=None, min_length=2, max_length=20)
    max_upload_mb: int | None = Field(default=None, ge=10, le=2048)
    auto_cleanup_temp_files: bool | None = None
