from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.commercial import UsageEvent, Workspace
from app.services import usage_service


@pytest.fixture()
def session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'usage.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    db = session_local()
    _ = (UsageEvent, Workspace)
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def test_trial_plan_blocks_when_monthly_limit_is_reached(session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(usage_service, "get_settings", lambda: SimpleNamespace(credit_limits_enabled=True))
    usage_service.consume_credits(session, "local-workspace", "transcription", 20)

    with pytest.raises(usage_service.HTTPException) as exc_info:
        usage_service.consume_credits(session, "local-workspace", "transcription", 1)

    assert exc_info.value.status_code == 402
    assert "20/20" in exc_info.value.detail


def test_disabled_credit_limits_keep_recording_without_blocking(session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(usage_service, "get_settings", lambda: SimpleNamespace(credit_limits_enabled=False))

    usage_service.consume_credits(session, "local-workspace", "transcription", 25)
    usage_service.consume_credits(session, "local-workspace", "transcription", 30)

    assert usage_service.current_month_credits(session, "local-workspace") == 55
