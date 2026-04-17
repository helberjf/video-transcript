from pathlib import Path
from types import SimpleNamespace

from app.models.enums import TranscriptionEngine
from app.services import transcription_service
from app.services.transcription_service import TranscriptionResult
from tests.conftest import create_test_session


def test_transcription_falls_back_to_gemini(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake")

    monkeypatch.setattr(
        transcription_service,
        "get_effective_provider_settings",
        lambda db: {"openai_api_key": "sk-test", "gemini_api_key": "gm-test", "whisper_model": "medium"},
    )
    monkeypatch.setattr(transcription_service, "get_settings", lambda: SimpleNamespace(provider_retries=0, whisper_model="medium"))
    monkeypatch.setattr(transcription_service, "_transcribe_openai", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("openai down")))
    monkeypatch.setattr(
        transcription_service,
        "_transcribe_gemini",
        lambda *args, **kwargs: TranscriptionResult(
            text="texto via gemini",
            engine=TranscriptionEngine.GEMINI,
            language_detected="pt",
            metadata={"model": "gemini"},
        ),
    )

    result = transcription_service.transcribe_audio(session, audio_path, "pt-BR")
    assert result.engine == TranscriptionEngine.GEMINI
    assert result.text == "texto via gemini"

    session.close()
    engine.dispose()
