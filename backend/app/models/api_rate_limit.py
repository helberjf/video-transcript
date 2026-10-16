from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ApiRateLimit(Base):
    """Contador em janela fixa por workspace e tipo de acao. No banco para valer entre instancias."""

    __tablename__ = "api_rate_limits"

    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
