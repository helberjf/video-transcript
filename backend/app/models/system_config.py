from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemConfig(Base):
    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    openai_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gemini_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    claude_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_report_template_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    whisper_model: Mapped[str] = mapped_column(String(40), default="medium", nullable=False)
    transcription_provider_order: Mapped[str] = mapped_column(String(120), default="openai,gemini,whisper", nullable=False)
    report_provider_order: Mapped[str] = mapped_column(String(120), default="openai,claude,gemini,local", nullable=False)
    export_directory: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(20), default="pt-BR", nullable=False)
    max_upload_mb: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    auto_cleanup_temp_files: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
