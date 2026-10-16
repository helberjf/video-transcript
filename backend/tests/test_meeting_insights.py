import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import recordings
from app.core import file_store
from app.core.config import get_settings
from app.core.database import get_db
from app.models import MeetingCapture
from app.models.enums import FileType, ProcessingStatus
from app.models.upload import Upload
from app.services import meeting_insights_service
from tests.conftest import create_test_session


TRANSCRIPT = (
    "Participantes identificados: Marina, Você\n\n"
    "[00:00:05] Marina: Precisamos fechar o roadmap. João manda o orçamento até sexta.\n"
    "[00:01:10] Você: Combinado, eu reviso a API pública até dia 30."
)

AI_JSON = """```json
{
  "titulo": "Roadmap do Q4",
  "resumo": "Reunião para fechar o roadmap.",
  "decisoes": ["Roadmap aprovado"],
  "checklist": [
    {"tarefa": "Enviar orçamento", "responsavel": "João", "prazo": "sexta", "minuto": "00:00:05"},
    "Revisar a API pública",
    {"task": "item com chave em ingles", "responsavel": "null"},
    {"responsavel": "sem tarefa"}
  ],
  "pendencias": [],
  "proximos_passos": null
}
```"""


@pytest.fixture()
def setup(tmp_path, monkeypatch):
    _ = (MeetingCapture, file_store.StoredFile)
    session, engine = create_test_session(tmp_path)
    monkeypatch.setattr(get_settings(), "storage_dir", tmp_path / "storage")
    upload = Upload(
        original_filename="Reuniao gravada.webm",
        stored_filename="recording.webm",
        file_type=FileType.AUDIO,
        mime_type="audio/webm",
        original_path="recordings/x/recording.webm",
        source_type="meeting",
        upload_size_bytes=10,
        status=ProcessingStatus.COMPLETED,
        transcription_text=TRANSCRIPT,
    )
    session.add(upload)
    session.commit()

    prompts: list[str] = []

    def fake_chain(_db, prompt):
        prompts.append(prompt)
        if prompt.startswith(meeting_insights_service.INSIGHTS_PROMPT[:30]):
            return AI_JSON, "claude"
        return "João envia o orçamento até sexta [00:00:05].", "claude"

    monkeypatch.setattr(meeting_insights_service, "_run_chain", fake_chain)

    app = FastAPI()
    app.include_router(recordings.router)
    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app), session, upload, prompts
    session.close()
    engine.dispose()


def test_insights_are_normalized_even_when_the_ai_varies_the_format(setup):
    client, session, upload, prompts = setup

    response = client.post(f"/api/uploads/{upload.id}/insights")

    assert response.status_code == 200
    insights = response.json()["meeting_insights"]
    assert insights["titulo"] == "Roadmap do Q4"
    assert [item["tarefa"] for item in insights["checklist"]] == [
        "Enviar orçamento",
        "Revisar a API pública",
        "item com chave em ingles",
    ]
    assert insights["checklist"][0] == {
        "tarefa": "Enviar orçamento",
        "responsavel": "João",
        "prazo": "sexta",
        "minuto": "00:00:05",
        "feito": False,
    }
    assert insights["checklist"][2]["responsavel"] is None
    assert insights["proximos_passos"] == []
    assert TRANSCRIPT in prompts[0]


def test_checklist_items_can_be_checked_and_added(setup):
    client, session, upload, _ = setup
    client.post(f"/api/uploads/{upload.id}/insights")

    checked = client.patch(f"/api/uploads/{upload.id}/checklist/1", json={"feito": True})
    added = client.post(f"/api/uploads/{upload.id}/checklist", json={"tarefa": "Marcar a próxima reunião"})

    assert checked.status_code == 200 and checked.json()["checklist"][1]["feito"] is True
    assert added.json()["checklist"][-1]["tarefa"] == "Marcar a próxima reunião"
    session.refresh(upload)
    stored = json.loads(upload.meeting_insights)
    assert stored["checklist"][1]["feito"] is True and len(stored["checklist"]) == 4
    assert client.patch(f"/api/uploads/{upload.id}/checklist/99", json={"feito": True}).status_code == 404


def test_questions_use_the_transcript_and_keep_history(setup):
    client, session, upload, prompts = setup
    client.post(f"/api/uploads/{upload.id}/insights")

    first = client.post(f"/api/uploads/{upload.id}/ask", json={"pergunta": "Quem manda o orçamento?"})
    second = client.post(f"/api/uploads/{upload.id}/ask", json={"pergunta": "E até quando?"})

    assert first.status_code == 200
    assert first.json()["resposta"].startswith("João envia")
    assert TRANSCRIPT in prompts[1] and "Quem manda o orçamento?" in prompts[1]
    # A segunda pergunta leva a anterior junto, para perguntas de continuação fazerem sentido.
    assert "Pergunta anterior: Quem manda o orçamento?" in prompts[2]
    assert second.status_code == 200
    session.refresh(upload)
    assert [item["pergunta"] for item in json.loads(upload.meeting_insights)["perguntas"]] == [
        "Quem manda o orçamento?",
        "E até quando?",
    ]


def test_regenerating_keeps_previous_questions(setup):
    client, session, upload, _ = setup
    client.post(f"/api/uploads/{upload.id}/insights")
    client.post(f"/api/uploads/{upload.id}/ask", json={"pergunta": "Quem manda o orçamento?"})

    regenerated = client.post(f"/api/uploads/{upload.id}/insights").json()["meeting_insights"]

    assert len(regenerated["perguntas"]) == 1


def test_question_before_transcript_is_ready_is_rejected(setup):
    client, session, upload, _ = setup
    upload.transcription_text = None
    session.commit()
    assert client.post(f"/api/uploads/{upload.id}/ask", json={"pergunta": "oi"}).status_code == 409
