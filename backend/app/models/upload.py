from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import FileType, ProcessingStatus, TranscriptionEngine


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(80), default="local-workspace", nullable=False, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[FileType] = mapped_column(Enum(FileType), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    original_path: Mapped[str] = mapped_column(String(500), nullable=False)
    converted_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    transcription_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcription_engine: Mapped[TranscriptionEngine] = mapped_column(
        Enum(TranscriptionEngine), default=TranscriptionEngine.NONE, nullable=False
    )
    language_detected: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[ProcessingStatus] = mapped_column(
        Enum(ProcessingStatus), default=ProcessingStatus.UPLOADED, nullable=False
    )
    upload_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Reunioes gravadas: JSON com os trechos por falante, os falantes e metadados da gravacao.
    transcript_segments: Mapped[str | None] = mapped_column(Text, nullable=True)
    speakers: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recording_meta: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    reports = relationship("GeneratedReport", back_populates="upload", cascade="all, delete-orphan")
    captures = relationship(
        "MeetingCapture",
        back_populates="upload",
        cascade="all, delete-orphan",
        order_by="MeetingCapture.offset_seconds",
    )
