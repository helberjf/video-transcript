"""Toda requisicao que chama a IA cobra creditos na web, e devolve se a IA falhar."""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.api.routes import forms, instagram, live, recordings, report_templates, reports, uploads
from app.core.database import get_db
from app.models.commercial import UsageEvent, Workspace
from app.services import meeting_insights_service, meeting_service, usage_service
from tests.conftest import create_test_session


WORKSPACE = "conta-web"
HEADERS = {"X-Workspace-Id": WORKSPACE}


@pytest.fixture()
def session(tmp_path):
    _ = (UsageEvent, Workspace)
    db, engine = create_test_session(tmp_path)
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


@pytest.fixture()
def limit(monkeypatch):
    """Muda o teto mensal do trial durante o teste."""
    current = {"value": 20}
    monkeypatch.setattr(
        usage_service,
        "get_settings",
        lambda: SimpleNamespace(credit_limits_enabled=True, trial_credit_limit=current["value"], backend_auth_required=False),
    )

    def set_limit(value: int) -> None:
        current["value"] = value

    return set_limit


@pytest.fixture()
def client(session, limit):
    app = FastAPI()
    app.include_router(api_router)
    app.dependency_overrides[get_db] = lambda: session
    return TestClient(app)


def _used(session) -> int:
    return usage_service.current_month_credits(session, WORKSPACE)


def _meeting():
    return SimpleNamespace(id="reuniao-1", transcription_text="texto", workspace_id=WORKSPACE)


# (metodo, rota, argumentos do request, modulo, funcao de IA que nao pode ser chamada sem saldo)
AI_REQUESTS = [
    ("post", "/api/forms/fill", {"json": {"template_id": "t", "source_text": "texto"}}, forms, "fill_form_from_text"),
    ("post", "/api/forms/fill-fields", {"json": {"template_id": "t", "fields": {}}}, forms, "fill_form_from_fields"),
    ("post", "/api/forms/detect-fields", {"json": {"template_id": "t", "source_text": "texto"}}, forms, "detect_form_fields"),
    (
        "post",
        "/api/forms/read-paper",
        {"data": {"template_id": "t"}, "files": {"files": ("papel.png", b"img", "image/png")}},
        forms,
        "read_paper_fields",
    ),
    (
        "post",
        "/api/report-templates/analyze-reference-preview",
        {"files": {"file": ("modelo.pdf", b"pdf", "application/pdf")}},
        report_templates,
        "analyze_template_reference",
    ),
    (
        "post",
        "/api/report-templates/extract-reference-text",
        {"files": {"file": ("modelo.pdf", b"pdf", "application/pdf")}},
        report_templates,
        "extract_template_reference_text",
    ),
    (
        "post",
        "/api/report-templates/analyze-reference",
        {"files": {"file": ("modelo.pdf", b"pdf", "application/pdf")}},
        report_templates,
        "create_template_from_reference",
    ),
    ("post", "/api/reports/generate", {"json": {"upload_id": "u"}}, reports, "generate_report"),
    ("post", "/api/live/transcribe", {"files": {"audio": ("janela.webm", b"audio", "audio/webm")}}, live, "transcribe_window"),
    ("post", "/api/live/suggest", {"json": {"lines": []}}, live, "suggest_reply"),
    ("post", "/api/instagram/post/analyze", {"json": {"url": "https://www.instagram.com/p/abc/"}}, instagram, "start_analyze_job"),
    ("post", "/api/uploads/reuniao-1/insights", {}, meeting_insights_service, "generate_insights"),
    ("post", "/api/uploads/reuniao-1/ask", {"json": {"pergunta": "Quem decide?"}}, meeting_insights_service, "ask_question"),
    ("post", "/api/recordings/reuniao-1/finish", {"json": {}}, recordings, "process_meeting"),
    ("post", "/api/recordings/reuniao-1/reprocess", {"json": {}}, recordings, "process_meeting"),
    ("post", "/api/process/u", {"json": {}}, uploads, "process_upload"),
]


@pytest.mark.parametrize(("method", "path", "kwargs", "module", "attr"), AI_REQUESTS, ids=[item[1] for item in AI_REQUESTS])
def test_ai_request_without_credits_is_refused_before_calling_the_ai(
    client, session, limit, monkeypatch, method, path, kwargs, module, attr
) -> None:
    called: list[str] = []
    monkeypatch.setattr(module, attr, lambda *args, **kwargs: called.append(attr))
    monkeypatch.setattr(recordings.recording_service, "get_meeting_or_404", lambda *args: _meeting())
    monkeypatch.setattr(recordings.recording_service, "finish_recording", lambda *args: _meeting())
    monkeypatch.setattr(recordings, "UploadRepository", lambda db: SimpleNamespace(save=lambda upload: upload))
    monkeypatch.setattr(uploads, "get_upload_or_404", lambda *args, **kwargs: SimpleNamespace(id="u", status="uploaded"))
    limit(0)

    response = getattr(client, method)(path, headers=HEADERS, **kwargs)

    assert response.status_code == 402, response.text
    assert called == []
    assert _used(session) == 0


def test_ai_request_charges_its_cost(client, session, monkeypatch) -> None:
    monkeypatch.setattr(forms, "detect_form_fields", lambda db, payload: {"template_id": "t", "fields": {}, "generator_engine": "openai"})

    response = client.post("/api/forms/detect-fields", headers=HEADERS, json={"template_id": "t", "source_text": "texto"})

    assert response.status_code == 200
    assert _used(session) == usage_service.credit_cost("form_field_detection")


def test_credits_come_back_when_the_ai_fails(client, session, monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise ValueError("Nenhuma chave de IA respondeu")

    monkeypatch.setattr(forms, "detect_form_fields", fail)

    response = client.post("/api/forms/detect-fields", headers=HEADERS, json={"template_id": "t", "source_text": "texto"})

    assert response.status_code == 400
    assert _used(session) == 0


def test_paper_reading_charges_one_credit_per_file(client, session, monkeypatch) -> None:
    monkeypatch.setattr(
        forms,
        "read_paper_fields",
        lambda *args, **kwargs: {"template_id": "t", "fields": {}, "transcription": "", "generator_engine": "openai"},
    )
    files = [("files", (f"pagina-{index}.png", b"img", "image/png")) for index in range(3)]

    response = client.post("/api/forms/read-paper", headers=HEADERS, data={"template_id": "t"}, files=files)

    assert response.status_code == 200
    assert _used(session) == 3


def test_live_transcription_charges_once_per_minute(client, session, monkeypatch) -> None:
    monkeypatch.setattr(live, "transcribe_window", lambda *args: ("ola", "openai"))
    window = {"audio": ("janela.webm", b"audio", "audio/webm")}

    for _ in range(5):
        assert client.post("/api/live/transcribe", headers=HEADERS, files=window).status_code == 200

    assert _used(session) in (1, 2)  # 2 so se o teste cruzar a virada do minuto


def test_silent_live_window_is_free(client, session, monkeypatch) -> None:
    monkeypatch.setattr(live, "transcribe_window", lambda *args: ("", "none"))

    response = client.post("/api/live/transcribe", headers=HEADERS, files={"audio": ("janela.webm", b"", "audio/webm")})

    assert response.json() == {"text": "", "engine": "none"}
    assert _used(session) == 0


def test_reprocessing_media_is_a_new_charge(client, session, monkeypatch) -> None:
    monkeypatch.setattr(uploads, "get_upload_or_404", lambda *args, **kwargs: SimpleNamespace(id="u", status="completed"))
    monkeypatch.setattr(uploads, "process_upload", lambda *args, **kwargs: None)

    client.post("/api/process/u", headers=HEADERS, json={})
    client.post("/api/process/u", headers=HEADERS, json={})  # clique duplo: mesma cobranca
    assert _used(session) == 1

    client.post("/api/process/u", headers=HEADERS, json={"force_reprocess": True})
    assert _used(session) == 2


def test_credit_status_endpoint_reports_balance_and_price_list(client, session, limit, monkeypatch) -> None:
    limit(5)
    monkeypatch.setattr(meeting_insights_service, "ask_question", lambda *args: {"pergunta": "?", "resposta": "!"})
    monkeypatch.setattr(recordings.recording_service, "get_meeting_or_404", lambda *args: _meeting())
    monkeypatch.setattr(recordings, "UploadRepository", lambda db: SimpleNamespace(save=lambda upload: upload))
    client.post("/api/uploads/reuniao-1/ask", headers=HEADERS, json={"pergunta": "Quem decide?"})

    body = client.get("/api/credits", headers=HEADERS).json()

    assert body["used"] == 1
    assert body["limit"] == 5
    assert body["remaining"] == 4
    assert body["unlimited_reason"] is None
    assert body["recent"][0]["label"] == "Pergunta sobre a reunião"
    assert {item["type"] for item in body["costs"]} == set(usage_service.CREDIT_COSTS)


def test_charge_does_not_refund_a_charge_made_by_an_earlier_request(session, limit) -> None:
    key = "live:conta-web:202610171200"
    with usage_service.charge(session, WORKSPACE, "live_transcription", idempotency_key=key):
        pass

    with pytest.raises(RuntimeError):
        with usage_service.charge(session, WORKSPACE, "live_transcription", idempotency_key=key):
            raise RuntimeError("janela seguinte falhou")

    assert _used(session) == 1


def test_refund_works_after_a_broken_transaction(session, limit) -> None:
    from sqlalchemy import text

    with pytest.raises(Exception):
        with usage_service.charge(session, WORKSPACE, "report_generation"):
            session.execute(text("SELECT * FROM tabela_que_nao_existe"))

    assert _used(session) == 0


def test_meeting_screenshots_are_charged_per_image_and_stop_without_credits(session, limit, monkeypatch) -> None:
    limit(1)
    monkeypatch.setattr(meeting_service, "get_effective_provider_settings", lambda db: {"gemini_api_key": "chave"})
    monkeypatch.setattr(meeting_service, "_describe_gemini", lambda data, mime, key: "Slide com o cronograma")
    monkeypatch.setattr(meeting_service.file_store, "get", lambda key, db: b"img")
    captures = [
        SimpleNamespace(
            id=f"c{index}",
            upload_id="reuniao-1",
            included=True,
            is_duplicate=False,
            description=None,
            stored_path="x",
            mime_type="image/png",
            vision_engine=None,
        )
        for index in range(3)
    ]

    meeting_service.describe_captures(session, captures, WORKSPACE)

    assert [capture.description for capture in captures] == ["Slide com o cronograma", None, None]
    assert _used(session) == 1
