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


def test_transcription_can_force_whisper_and_override_model(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake")

    monkeypatch.setattr(
        transcription_service,
        "get_effective_provider_settings",
        lambda db: {
            "openai_api_key": "sk-test",
            "gemini_api_key": "gm-test",
            "whisper_model": "medium",
            "transcription_provider_order": ["openai", "gemini", "whisper"],
        },
    )
    monkeypatch.setattr(transcription_service, "get_settings", lambda: SimpleNamespace(provider_retries=0, whisper_model="medium"))

    called: dict[str, str] = {}

    monkeypatch.setattr(
        transcription_service,
        "_transcribe_whisper",
        lambda audio_path, language, model_name: (
            called.setdefault("model", model_name),
            TranscriptionResult(
                text="texto via whisper",
                engine=TranscriptionEngine.WHISPER,
                language_detected="pt",
                metadata={"model": model_name},
            ),
        )[1],
    )

    result = transcription_service.transcribe_audio(
        session,
        audio_path,
        "pt-BR",
        use_api=False,
        whisper_model_override="small",
    )

    assert result.engine == TranscriptionEngine.WHISPER
    assert called["model"] == "small"

    session.close()
    engine.dispose()


def test_transcription_preference_runs_selected_provider_first(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake")

    monkeypatch.setattr(
        transcription_service,
        "get_effective_provider_settings",
        lambda db: {
            "openai_api_key": "sk-test",
            "gemini_api_key": "gm-test",
            "whisper_model": "medium",
            "transcription_provider_order": ["gemini", "openai", "whisper"],
        },
    )
    monkeypatch.setattr(transcription_service, "get_settings", lambda: SimpleNamespace(provider_retries=0, whisper_model="medium"))

    called: list[str] = []

    monkeypatch.setattr(
        transcription_service,
        "_transcribe_openai",
        lambda *args, **kwargs: (
            called.append("openai"),
            TranscriptionResult(
                text="texto via openai",
                engine=TranscriptionEngine.OPENAI,
                language_detected="pt",
                metadata={"model": "gpt-4o-mini-transcribe"},
            ),
        )[1],
    )
    monkeypatch.setattr(
        transcription_service,
        "_transcribe_gemini",
        lambda *args, **kwargs: (
            called.append("gemini"),
            TranscriptionResult(
                text="texto via gemini",
                engine=TranscriptionEngine.GEMINI,
                language_detected="pt",
                metadata={"model": "gemini"},
            ),
        )[1],
    )

    result = transcription_service.transcribe_audio(
        session,
        audio_path,
        "pt-BR",
        transcription_provider_preference="openai",
    )

    assert result.engine == TranscriptionEngine.OPENAI
    assert called == ["openai"]

    session.close()
    engine.dispose()


def test_transcription_preference_without_configured_api_key_uses_next_provider_in_settings_order(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake")

    monkeypatch.setattr(
        transcription_service,
        "get_effective_provider_settings",
        lambda db: {
            "openai_api_key": None,
            "gemini_api_key": "gm-test",
            "whisper_model": "medium",
            "transcription_provider_order": ["openai", "whisper", "gemini"],
        },
    )
    monkeypatch.setattr(transcription_service, "get_settings", lambda: SimpleNamespace(provider_retries=0, whisper_model="medium"))

    called: list[str] = []

    monkeypatch.setattr(
        transcription_service,
        "_transcribe_whisper",
        lambda *args, **kwargs: (
            called.append("whisper"),
            TranscriptionResult(
                text="texto via whisper",
                engine=TranscriptionEngine.WHISPER,
                language_detected="pt",
                metadata={"model": "medium"},
            ),
        )[1],
    )
    monkeypatch.setattr(
        transcription_service,
        "_transcribe_gemini",
        lambda *args, **kwargs: (
            called.append("gemini"),
            TranscriptionResult(
                text="texto via gemini",
                engine=TranscriptionEngine.GEMINI,
                language_detected="pt",
                metadata={"model": "gemini"},
            ),
        )[1],
    )

    result = transcription_service.transcribe_audio(
        session,
        audio_path,
        "pt-BR",
        transcription_provider_preference="openai",
    )

    assert result.engine == TranscriptionEngine.WHISPER
    assert called == ["whisper"]

    session.close()
    engine.dispose()
