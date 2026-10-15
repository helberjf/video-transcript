import io
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.api.routes import recordings
from app.core import file_store
from app.core.config import get_settings
from app.core.database import get_db
from app.models import MeetingCapture
from app.models.enums import ProcessingStatus
from app.models.upload import Upload
from app.services import meeting_service
from app.services.diarization_service import Segment, _parse_json_array, _seconds
from tests.conftest import create_test_session


# "database" e o modo da Vercel: os bytes ficam no Postgres em vez do disco.
@pytest.fixture(params=["local", "database"])
def client(tmp_path, monkeypatch, request):
    _ = (MeetingCapture, file_store.StoredFile)
    session, engine = create_test_session(tmp_path)
    monkeypatch.setattr(get_settings(), "storage_dir", tmp_path / "storage")
    monkeypatch.setattr(get_settings(), "file_storage", request.param)
    processed: list[str] = []
    monkeypatch.setattr(recordings, "process_meeting", processed.append)

    app = FastAPI()
    app.include_router(recordings.router)
    app.dependency_overrides[get_db] = lambda: session
    test_client = TestClient(app)
    test_client.processed = processed
    test_client.session = session
    yield test_client
    session.close()
    engine.dispose()


def _png_bytes(color: str) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 36), color).save(buffer, format="PNG")
    return buffer.getvalue()


def test_recording_flow_joins_chunks_in_order_and_queues_processing(client):
    started = client.post("/api/recordings", json={"title": "Daily: time/produto", "language": "pt-BR"})
    assert started.status_code == 200
    upload_id = started.json()["id"]

    # Fora de ordem e com reenvio do mesmo pedaco: o resultado precisa sair em ordem e sem duplicar.
    assert client.put(f"/api/recordings/{upload_id}/chunks/1", content=b"BBB").status_code == 200
    assert client.put(f"/api/recordings/{upload_id}/chunks/0", content=b"AAA").status_code == 200
    assert client.put(f"/api/recordings/{upload_id}/chunks/1", content=b"BBB").status_code == 200

    capture = client.post(
        f"/api/recordings/{upload_id}/captures",
        files={"image": ("tela.png", _png_bytes("white"), "image/png")},
        data={"offset_seconds": "12.5", "trigger": "hotkey"},
    )
    assert capture.status_code == 200
    assert capture.json()["width"] == 64

    finished = client.post(
        f"/api/recordings/{upload_id}/finish",
        json={"analysis_mode": "audio_images", "duration_seconds": 30, "energy": [[0.5, 0.9, 0.1]]},
    )
    assert finished.status_code == 200
    assert client.processed == [upload_id]

    upload = client.session.get(Upload, upload_id)
    assert upload.status == ProcessingStatus.UPLOADED
    assert upload.analysis_mode == "audio_images"
    assert file_store.get(upload.original_path, client.session) == b"AAABBB"
    assert upload.original_filename == "Daily time produto.webm"

    # Depois de finalizada, a gravacao nao aceita mais audio.
    assert client.put(f"/api/recordings/{upload_id}/chunks/2", content=b"CCC").status_code == 409


def test_finish_without_audio_is_rejected(client):
    upload_id = client.post("/api/recordings", json={}).json()["id"]
    response = client.post(f"/api/recordings/{upload_id}/finish", json={})
    assert response.status_code == 400


def test_capture_rejects_non_image(client):
    upload_id = client.post("/api/recordings", json={}).json()["id"]
    response = client.post(
        f"/api/recordings/{upload_id}/captures",
        files={"image": ("x.txt", b"oi", "text/plain")},
    )
    assert response.status_code == 400


def test_self_speaker_comes_from_microphone_energy():
    segments = [
        Segment(start=0, end=4, text="Bom dia, pessoal", speaker="A"),
        Segment(start=4, end=8, text="Bom dia! Vamos ao roadmap", speaker="B"),
        Segment(start=8, end=10, text="Pode seguir", speaker="A"),
    ]
    energy = [[1, 0.9, 0.05], [3, 0.8, 0.1], [5, 0.05, 0.7], [7, 0.02, 0.9], [9, 0.7, 0.1]]

    serialized, speakers = meeting_service.build_speakers(segments, energy, has_speaker_labels=True)

    assert speakers[0] == {"label": "A", "name": "Você", "is_self": True, "suggested_name": None}
    assert speakers[1]["name"] == "Participante 1" and not speakers[1]["is_self"]
    assert serialized[1]["self_ratio"] < 0.2


def test_without_diarization_channels_split_user_and_others():
    segments = [Segment(start=0, end=2, text="minha fala"), Segment(start=2, end=4, text="fala de outra pessoa")]
    energy = [[1, 0.9, 0.0], [3, 0.0, 0.9]]

    serialized, speakers = meeting_service.build_speakers(segments, energy, has_speaker_labels=False)

    assert [item["speaker"] for item in serialized] == [meeting_service.SELF_LABEL, meeting_service.OTHERS_LABEL]
    assert [speaker["name"] for speaker in speakers] == ["Você", "Participantes"]


def test_meeting_text_merges_turns_and_interleaves_captures():
    upload = Upload(analysis_mode="audio_images")
    upload.transcript_segments = json.dumps(
        [
            {"start": 0, "end": 3, "speaker": "A", "text": "Primeira parte."},
            {"start": 3, "end": 6, "speaker": "A", "text": "Continua."},
            {"start": 70, "end": 75, "speaker": "B", "text": "Agora eu."},
        ]
    )
    upload.speakers = json.dumps([{"label": "A", "name": "Marina"}, {"label": "B", "name": "Você"}])
    upload.captures = [
        MeetingCapture(offset_seconds=65, included=True, is_duplicate=False, description="Slide Roadmap Q4", stored_path=""),
        MeetingCapture(offset_seconds=66, included=True, is_duplicate=True, description="igual", stored_path=""),
    ]

    text = meeting_service.build_meeting_text(upload)

    assert text.splitlines()[2:] == [
        "[00:00:00] Marina: Primeira parte. Continua.",
        "[00:01:05] [Captura de tela 1] Slide Roadmap Q4",
        "[00:01:10] Você: Agora eu.",
    ]
    assert meeting_service.build_meeting_text(upload, include_captures=False).count("Captura") == 0


def test_rename_speakers_rewrites_transcription():
    upload = Upload(analysis_mode="audio")
    upload.transcript_segments = json.dumps([{"start": 0, "end": 1, "speaker": "A", "text": "Oi"}])
    upload.speakers = json.dumps([{"label": "A", "name": "Participante 1", "is_self": False}])
    upload.captures = []

    meeting_service.rename_speakers(upload, {"A": "João"})

    assert "[00:00:00] João: Oi" in upload.transcription_text


def test_duplicate_captures_are_flagged():
    first = MeetingCapture(dhash="ffff0000ffff0000", stored_path="")
    same = MeetingCapture(dhash="ffff0000ffff0001", stored_path="")
    other = MeetingCapture(dhash="0000ffff0000ffff", stored_path="")
    meeting_service.mark_duplicate_captures([first, same, other])
    assert [first.is_duplicate, same.is_duplicate, other.is_duplicate] == [False, True, False]


def test_gemini_json_parsing_accepts_fences_and_clock_times():
    raw = '```json\n[{"start": "01:05", "end": "1:10", "speaker": "B", "text": "ok"}]\n```'
    items = _parse_json_array(raw)
    assert items[0]["speaker"] == "B"
    assert _seconds(items[0]["start"]) == 65
    assert _seconds("1:00:00") == 3600
