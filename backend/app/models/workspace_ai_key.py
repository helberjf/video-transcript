from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WorkspaceAiKey(Base):
    """Acesso a IA de cada conta da web e as chaves proprias dela, sempre cifradas."""

    __tablename__ = "workspace_ai_keys"

    workspace_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    # "admin" e "shared" usam a chave do dono do sistema; "own" usa as chaves abaixo.
    access: Mapped[str] = mapped_column(String(16), default="own", nullable=False)
    openai_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    gemini_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    claude_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
