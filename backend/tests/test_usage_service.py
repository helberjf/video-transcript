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


def _web_settings(trial_credit_limit: int = 20) -> SimpleNamespace:
    return SimpleNamespace(credit_limits_enabled=True, trial_credit_limit=trial_credit_limit)


def test_web_trial_blocks_when_monthly_limit_is_reached(session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(usage_service, "get_settings", _web_settings)
    usage_service.consume_credits(session, "web-workspace", "transcription", 20)

    with pytest.raises(usage_service.HTTPException) as exc_info:
        usage_service.consume_credits(session, "web-workspace", "transcription", 1)

    assert exc_info.value.status_code == 402
    assert "20/20" in exc_info.value.detail


def test_single_media_longer_than_the_plan_gets_a_specific_message(
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(usage_service, "get_settings", _web_settings)

    with pytest.raises(usage_service.HTTPException) as exc_info:
        usage_service.consume_credits(session, "web-workspace", "media_processing_duration", 45)

    assert "45 creditos" in exc_info.value.detail
    assert "mais curto" in exc_info.value.detail


def test_trial_limit_is_configurable(session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(usage_service, "get_settings", lambda: _web_settings(trial_credit_limit=45))

    usage_service.consume_credits(session, "web-workspace", "media_processing_duration", 45)

    assert usage_service.current_month_credits(session, "web-workspace") == 45


def test_admin_plan_from_login_token_removes_the_limit(session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(usage_service, "get_settings", _web_settings)

    # Sem sincronia o backend trata o admin como trial e bloqueia em 20.
    usage_service.sync_workspace_plan(session, "admin-workspace", "enterprise")
    usage_service.consume_credits(session, "admin-workspace", "media_processing_duration", 90)

    assert usage_service.plan_credit_limit("enterprise") is None
    assert usage_service.current_month_credits(session, "admin-workspace") == 90


def test_unknown_plan_from_token_is_ignored(session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(usage_service, "get_settings", _web_settings)
    usage_service.ensure_workspace(session, "web-workspace")

    usage_service.sync_workspace_plan(session, "web-workspace", "ilimitado-de-mentira")

    assert usage_service.plan_credit_limit(session.get(Workspace, "web-workspace").plan) == 20


def test_desktop_mode_records_usage_without_blocking(session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        usage_service,
        "get_settings",
        lambda: SimpleNamespace(credit_limits_enabled=False, trial_credit_limit=20),
    )

    usage_service.consume_credits(session, "local-workspace", "transcription", 25)
    usage_service.consume_credits(session, "local-workspace", "transcription", 30)

    assert usage_service.current_month_credits(session, "local-workspace") == 55
