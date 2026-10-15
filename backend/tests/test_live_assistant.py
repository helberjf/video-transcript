import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import live
from app.core.config import get_settings
from app.core.database import get_db
from app.services import live_service


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "temp_dir", tmp_path)
    app = FastAPI()
    app.include_router(live.router)
    app.dependency_overrides[get_db] = lambda: None
    return TestClient(app)


def _config(**keys):
    return lambda _db: {"report_provider_order": ["openai", "claude", "gemini"], **keys}


def test_transcribe_window_uses_openai_and_cleans_temp_file(client, tmp_path, monkeypatch):
    monkeypatch.setattr(live_service, "get_effective_provider_settings", _config(openai_api_key="sk-test"))
    seen: dict = {}

    def fake_openai(path, language, prompt, key):
        seen.update(path=path, language=language, prompt=prompt, bytes=path.read_bytes())
        return "Qual o prazo da entrega?"

    monkeypatch.setattr(live_service, "_transcribe_window_openai", fake_openai)
    response = client.post(
        "/api/live/transcribe",
        files={"audio": ("w.webm", b"webm-bytes", "audio/webm")},
        data={"language": "pt-BR", "prompt": "contexto anterior"},
    )

    assert response.status_code == 200
    assert response.json() == {"text": "Qual o prazo da entrega?", "engine": "openai"}
    assert seen["bytes"] == b"webm-bytes" and seen["prompt"] == "contexto anterior"
    assert not seen["path"].exists()


def test_transcribe_window_drops_whisper_style_hallucinations(client, monkeypatch):
    monkeypatch.setattr(live_service, "get_effective_provider_settings", _config(openai_api_key="sk-test"))
    monkeypatch.setattr(live_service, "_transcribe_window_openai", lambda *args: "Obrigado por assistir!")
    response = client.post("/api/live/transcribe", files={"audio": ("w.webm", b"x", "audio/webm")})
    assert response.json()["text"] == ""


def test_transcribe_window_without_keys_explains_setup(client, monkeypatch):
    monkeypatch.setattr(live_service, "get_effective_provider_settings", _config())
    response = client.post("/api/live/transcribe", files={"audio": ("w.webm", b"x", "audio/webm")})
    assert response.status_code == 400
    assert "Ajustes" in response.json()["detail"]


def test_suggest_falls_back_to_next_provider_and_sends_context(client, monkeypatch):
    monkeypatch.setattr(
        live_service, "get_effective_provider_settings", _config(openai_api_key="sk-test", claude_api_key="ck-test")
    )
    prompts: list[str] = []

    def failing_openai(prompt, key):
        raise RuntimeError("rede caiu")

    def claude(prompt, key):
        prompts.append(prompt)
        return "Diga que entrega na sexta."

    monkeypatch.setattr(live_service, "_suggest_openai", failing_openai)
    monkeypatch.setattr(live_service, "_suggest_claude", claude)

    response = client.post(
        "/api/live/suggest",
        json={
            "lines": [{"speaker": "Participante", "text": "Qual o prazo?"}, {"speaker": "Você", "text": "Deixa eu ver"}],
            "context": "Sou o gerente do projeto Alfa",
        },
    )

    assert response.status_code == 200
    assert response.json()["suggestion"] == "Diga que entrega na sexta."
    assert response.json()["engine"] == "claude"
    assert "Sou o gerente do projeto Alfa" in prompts[0]
    assert prompts[0].index("Participante: Qual o prazo?") < prompts[0].index("Você: Deixa eu ver")
