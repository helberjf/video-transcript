from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import rate_limit as rate_limit_module
from app.core.config import get_settings
from app.core.database import get_db
from app.core.workspace import get_workspace_id
from tests.conftest import create_test_session


@pytest.fixture()
def session(tmp_path):
    db, engine = create_test_session(tmp_path)
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def test_blocks_after_the_limit_and_tells_when_to_retry(session) -> None:
    results = [rate_limit_module.consume(session, "ai:conta-a", 3, 600) for _ in range(4)]

    assert results[:3] == [None, None, None]
    assert 590 <= results[3] <= 600


def test_each_workspace_has_its_own_counter(session) -> None:
    for _ in range(3):
        rate_limit_module.consume(session, "ai:conta-a", 3, 600)

    assert rate_limit_module.consume(session, "ai:conta-b", 3, 600) is None


def test_counter_restarts_when_the_window_ends(session, monkeypatch) -> None:
    start = datetime(2026, 10, 16, 12, 0, 0)
    monkeypatch.setattr(rate_limit_module, "_now", lambda: start)
    for _ in range(4):
        rate_limit_module.consume(session, "ai:conta-a", 3, 600)

    monkeypatch.setattr(rate_limit_module, "_now", lambda: start + timedelta(seconds=601))

    assert rate_limit_module.consume(session, "ai:conta-a", 3, 600) is None


def _app(session, workspace: str = "conta-a") -> TestClient:
    app = FastAPI()

    @app.post("/api/settings", dependencies=[rate_limit_module.rate_limit("settings")])
    def update():
        return {"ok": True}

    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_workspace_id] = lambda: workspace
    return TestClient(app)


def test_web_route_answers_429_with_retry_after(session, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "backend_auth_required", True)
    client = _app(session)
    limit, _ = rate_limit_module.RATE_LIMITS["settings"]

    statuses = [client.post("/api/settings").status_code for _ in range(limit)]
    blocked = client.post("/api/settings")

    assert statuses == [200] * limit
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_desktop_is_never_limited(session, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "backend_auth_required", False)
    client = _app(session)
    limit, _ = rate_limit_module.RATE_LIMITS["settings"]

    assert all(client.post("/api/settings").status_code == 200 for _ in range(limit + 5))
