from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ReportFormat, TranscriptionEngine


class GeneratedReport(Base):
    __tablename__ = "generated_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(80), default="local-workspace", nullable=False, index=True)
    upload_id: Mapped[str] = mapped_column(String(36), ForeignKey("uploads.id"), nullable=False)
    template_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("report_templates.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    request_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    custom_request: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    additional_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    output_format: Mapped[ReportFormat] = mapped_column(Enum(ReportFormat), default=ReportFormat.MARKDOWN)
    generator_engine: Mapped[TranscriptionEngine] = mapped_column(
        Enum(TranscriptionEngine), default=TranscriptionEngine.NONE, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    upload = relationship("Upload", back_populates="reports")
    template = relationship("ReportTemplate")
