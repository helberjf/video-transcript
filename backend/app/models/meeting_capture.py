from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import CaptureTrigger


class MeetingCapture(Base):
    __tablename__ = "meeting_captures"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(80), default="local-workspace", nullable=False, index=True)
    upload_id: Mapped[str] = mapped_column(String(36), ForeignKey("uploads.id"), nullable=False, index=True)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(60), default="image/png", nullable=False)
    offset_seconds: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    trigger: Mapped[CaptureTrigger] = mapped_column(Enum(CaptureTrigger), default=CaptureTrigger.MANUAL, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dhash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    included: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vision_engine: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    upload = relationship("Upload", back_populates="captures")
