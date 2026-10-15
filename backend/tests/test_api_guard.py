import time

import jwt
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.api_guard import ApiGuardMiddleware
from app.core.config import get_settings


SECRET = "s" * 48
SITE = "https://modeloia.vercel.app"


@pytest.fixture()
def client(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "backend_auth_required", True)
    monkeypatch.setattr(settings, "backend_auth_secret", SECRET)
    monkeypatch.setattr(settings, "cors_origins", SITE)
    monkeypatch.setattr(settings, "cors_origin_regex", None)

    app = FastAPI()
    app.add_middleware(ApiGuardMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=[SITE], allow_methods=["*"], allow_headers=["*"])

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/recordings")
    def protected():
        return {"ok": True}

    return TestClient(app)


def _token():
    return jwt.encode({"workspaceId": "pessoal", "exp": int(time.time()) + 300}, SECRET, algorithm="HS256")


def test_postman_without_origin_is_rejected_even_with_token(client):
    response = client.post("/api/recordings", headers={"Authorization": f"Bearer {_token()}"})
    assert response.status_code == 403


def test_forged_origin_without_token_is_rejected(client):
    response = client.post("/api/recordings", headers={"Origin": SITE})
    assert response.status_code == 401


def test_token_signed_with_other_secret_is_rejected(client):
    forged = jwt.encode({"workspaceId": "pessoal", "exp": int(time.time()) + 300}, "outro-segredo", algorithm="HS256")
    response = client.post("/api/recordings", headers={"Origin": SITE, "Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_expired_token_is_rejected(client):
    expired = jwt.encode({"workspaceId": "pessoal", "exp": int(time.time()) - 5}, SECRET, algorithm="HS256")
    response = client.post("/api/recordings", headers={"Origin": SITE, "Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_token_without_expiration_is_rejected(client):
    eternal = jwt.encode({"workspaceId": "pessoal"}, SECRET, algorithm="HS256")
    response = client.post("/api/recordings", headers={"Origin": SITE, "Authorization": f"Bearer {eternal}"})
    assert response.status_code == 401


def test_other_site_is_rejected(client):
    response = client.post(
        "/api/recordings", headers={"Origin": "https://evil.example", "Authorization": f"Bearer {_token()}"}
    )
    assert response.status_code == 403


def test_browser_from_site_with_token_passes_and_gets_cors_headers(client):
    response = client.post("/api/recordings", headers={"Origin": SITE, "Authorization": f"Bearer {_token()}"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == SITE


def test_rejections_still_carry_cors_headers_so_the_app_can_show_the_error(client):
    response = client.post("/api/recordings", headers={"Origin": SITE})
    assert response.headers.get("access-control-allow-origin") == SITE


def test_health_and_preflight_stay_open(client):
    assert client.get("/api/health").status_code == 200
    preflight = client.options(
        "/api/recordings",
        headers={"Origin": SITE, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization"},
    )
    assert preflight.status_code == 200
