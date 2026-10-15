from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Enum, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ReportFormat


class ReportTemplate(Base):
    __tablename__ = "report_templates"
    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_report_templates_workspace_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(80), default="local-workspace", nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    base_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    example_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    complementary_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    form_fields: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    output_format: Mapped[ReportFormat] = mapped_column(Enum(ReportFormat), default=ReportFormat.MARKDOWN)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
