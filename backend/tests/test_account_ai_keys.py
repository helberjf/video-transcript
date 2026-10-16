import time

import jwt
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core import ai_key_crypto
from app.core.api_guard import ApiGuardMiddleware
from app.core.config import get_settings
from app.core.request_context import current_workspace_id, workspace_scope
from app.models.workspace_ai_key import WorkspaceAiKey
from app.schemas.settings import SettingsUpdate
from app.services import settings_service
from app.services.ai_key_service import sync_ai_key_access
from tests.conftest import create_test_session


OWNER_KEY = "sk-dono-do-sistema-123456"
SECRET = "s" * 48
SITE = "https://modeloia.vercel.app"


@pytest.fixture()
def web_session(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "backend_auth_required", True)
    monkeypatch.setattr(settings, "ai_keys_encryption_key", "k" * 40)
    monkeypatch.setattr(settings, "openai_api_key", None)
    monkeypatch.setattr(settings, "gemini_api_key", None)
    monkeypatch.setattr(settings, "claude_api_key", None)
    session, engine = create_test_session(tmp_path)
    config = settings_service.get_or_create_system_config(session)
    config.openai_api_key = OWNER_KEY
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_encrypted_key_round_trips_only_for_the_same_workspace(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "ai_keys_encryption_key", "k" * 40)

    encrypted = ai_key_crypto.encrypt_api_key("sk-da-conta-a", "conta-a")

    assert "sk-da-conta-a" not in encrypted
    assert ai_key_crypto.decrypt_api_key(encrypted, "conta-a") == "sk-da-conta-a"
    assert ai_key_crypto.decrypt_api_key(encrypted, "conta-b") is None


def test_production_without_master_key_refuses_to_encrypt(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_keys_encryption_key", None)
    monkeypatch.setattr(settings, "app_env", "production")

    with pytest.raises(ai_key_crypto.AiKeyCryptoError):
        ai_key_crypto.encrypt_api_key("sk-qualquer", "conta-a")


def test_own_account_key_is_stored_encrypted_and_never_mixes_with_the_owner_key(web_session) -> None:
    sync_ai_key_access(web_session, "conta-a", "own")

    updated = settings_service.update_settings(
        web_session,
        SettingsUpdate(openai_api_key="sk-da-conta-a-999999", whisper_model="tiny"),
        workspace_id="conta-a",
    )

    stored = web_session.get(WorkspaceAiKey, "conta-a")
    assert stored.openai_api_key.startswith("v1:")
    assert "sk-da-conta-a" not in stored.openai_api_key
    assert updated.ai_key_access == "own"
    assert updated.openai_api_key_masked == "sk-**************999"
    # Conta comum nao mexe nos ajustes globais nem na chave do dono.
    config = settings_service.get_or_create_system_config(web_session)
    assert config.whisper_model != "tiny"
    assert config.openai_api_key == OWNER_KEY
    assert settings_service.get_effective_provider_settings(web_session, "conta-a")["openai_api_key"] == "sk-da-conta-a-999999"


def test_account_without_key_does_not_fall_back_to_the_owner_key(web_session) -> None:
    sync_ai_key_access(web_session, "conta-nova", "own")

    effective = settings_service.get_effective_provider_settings(web_session, "conta-nova")

    assert effective["openai_api_key"] is None


def test_unknown_workspace_gets_no_key(web_session) -> None:
    assert settings_service.get_effective_provider_settings(web_session)["openai_api_key"] is None


def test_shared_account_uses_the_owner_key_without_seeing_it(web_session) -> None:
    sync_ai_key_access(web_session, "conta-liberada", "shared")

    with workspace_scope("conta-liberada"):
        effective = settings_service.get_effective_provider_settings(web_session)
        read = settings_service.read_settings(web_session)

    assert effective["openai_api_key"] == OWNER_KEY
    assert read.ai_key_access == "shared"
    assert read.openai_api_key_masked is None


def test_shared_account_cannot_replace_keys(web_session) -> None:
    sync_ai_key_access(web_session, "conta-liberada", "shared")

    with pytest.raises(HTTPException) as exc_info:
        settings_service.update_settings(web_session, SettingsUpdate(openai_api_key="sk-outra"), workspace_id="conta-liberada")

    assert exc_info.value.status_code == 403


def test_guard_puts_the_token_workspace_in_the_request_context(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "backend_auth_required", True)
    monkeypatch.setattr(settings, "backend_auth_secret", SECRET)
    monkeypatch.setattr(settings, "cors_origins", SITE)
    monkeypatch.setattr(settings, "cors_origin_regex", None)

    app = FastAPI()
    app.add_middleware(ApiGuardMiddleware)

    @app.get("/api/quem")
    def quem():
        return {"workspace": current_workspace_id.get()}

    token = jwt.encode({"workspaceId": "conta-a", "exp": int(time.time()) + 300}, SECRET, algorithm="HS256")
    response = TestClient(app).get("/api/quem", headers={"Origin": SITE, "Authorization": f"Bearer {token}"})

    assert response.json() == {"workspace": "conta-a"}
