import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.database import Base, get_db
from app.core.workspace import get_workspace_id
from app.models.commercial import UsageEvent, Workspace
from app.services import usage_service

SECRET = "modeloia-dev-backend-secret"


@pytest.fixture()
def client(tmp_path, monkeypatch: pytest.MonkeyPatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'plan.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    _ = (UsageEvent, Workspace)

    # Simula o deploy web: o .env local liga o modo desktop, que zera os limites.
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DESKTOP_MODE", "false")
    # Fora de development o segredo compartilhado com o frontend e obrigatorio.
    monkeypatch.setenv("BACKEND_AUTH_SECRET", SECRET)
    get_settings.cache_clear()

    app = FastAPI()

    @app.get("/quem-sou-eu")
    def whoami(workspace_id: str = Depends(get_workspace_id), db: Session = Depends(get_db)) -> dict[str, object]:
        workspace = usage_service.ensure_workspace(db, workspace_id)
        return {"workspace_id": workspace_id, "plan": workspace.plan, "limit": usage_service.plan_credit_limit(workspace.plan)}

    def override_get_db():
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        engine.dispose()
        get_settings.cache_clear()


def token_for(workspace_id: str, plan: str | None) -> str:
    payload: dict[str, object] = {"workspaceId": workspace_id}
    if plan:
        payload["plan"] = plan
    return jwt.encode(payload, SECRET, algorithm="HS256")


def test_admin_token_promotes_the_backend_workspace(client: TestClient) -> None:
    response = client.get(
        "/quem-sou-eu",
        headers={"Authorization": f"Bearer {token_for('admin-modeloia-com', 'enterprise')}"},
    )

    assert response.status_code == 200
    assert response.json() == {"workspace_id": "admin-modeloia-com", "plan": "enterprise", "limit": None}


def test_invited_user_token_stays_on_the_free_plan(client: TestClient) -> None:
    response = client.get(
        "/quem-sou-eu",
        headers={"Authorization": f"Bearer {token_for('convidado-email-com', 'trial')}"},
    )

    assert response.json() == {"workspace_id": "convidado-email-com", "plan": "trial", "limit": 20}


def test_request_without_token_keeps_the_default_workspace(client: TestClient) -> None:
    response = client.get("/quem-sou-eu", headers={"X-Workspace-Id": "local-workspace"})

    assert response.json()["workspace_id"] == "local-workspace"
