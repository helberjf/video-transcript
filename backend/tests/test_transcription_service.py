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


def _whisper_only_settings(monkeypatch, whisper_model: str = "large") -> None:
    monkeypatch.setattr(
        transcription_service,
        "get_effective_provider_settings",
        lambda db: {"whisper_model": whisper_model, "transcription_provider_order": ["openai", "gemini", "whisper"]},
    )
    monkeypatch.setattr(transcription_service, "get_settings", lambda: SimpleNamespace(provider_retries=2, whisper_model="medium"))


def test_whisper_model_chain_goes_down_to_lighter_models() -> None:
    assert transcription_service.whisper_model_chain("medium") == ["medium", "small", "base", "tiny"]
    assert transcription_service.whisper_model_chain("large-v3") == ["large-v3", "medium", "small", "base", "tiny"]
    assert transcription_service.whisper_model_chain("large", max_model="medium") == ["medium", "small", "base", "tiny"]
    # Um modelo mais leve que o limite e mantido.
    assert transcription_service.whisper_model_chain("base", max_model="medium") == ["base", "tiny"]
    assert transcription_service.whisper_model_chain("tiny") == ["tiny"]


def test_without_api_uses_medium_and_falls_back_when_memory_runs_out(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake")
    _whisper_only_settings(monkeypatch, whisper_model="large")

    called: list[str] = []

    def fake_whisper(audio_path, language, model_name):
        called.append(model_name)
        if model_name == "medium":
            raise MemoryError()
        return TranscriptionResult(text="texto leve", engine=TranscriptionEngine.WHISPER, language_detected="pt", metadata={"model": model_name})

    monkeypatch.setattr(transcription_service, "_transcribe_whisper", fake_whisper)

    result = transcription_service.transcribe_audio(session, audio_path, "pt-BR")

    # Sem chave de API: comeca no medium (nao no large configurado), tenta uma vez e desce para o small.
    assert called == ["medium", "small"]
    assert result.metadata["model"] == "small"

    session.close()
    engine.dispose()


def test_forced_whisper_keeps_chosen_model_before_falling_back(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake")
    _whisper_only_settings(monkeypatch)

    called: list[str] = []

    def fake_whisper(audio_path, language, model_name):
        called.append(model_name)
        if model_name == "large":
            raise MemoryError()
        return TranscriptionResult(text="ok", engine=TranscriptionEngine.WHISPER, language_detected="pt", metadata={"model": model_name})

    monkeypatch.setattr(transcription_service, "_transcribe_whisper", fake_whisper)

    transcription_service.transcribe_audio(session, audio_path, "pt-BR", use_api=False, whisper_model_override="large")

    assert called == ["large", "medium"]

    session.close()
    engine.dispose()


def test_whisper_failure_message_names_each_model(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake")
    _whisper_only_settings(monkeypatch, whisper_model="small")

    def always_out_of_memory(audio_path, language, model_name):
        raise MemoryError()

    monkeypatch.setattr(transcription_service, "_transcribe_whisper", always_out_of_memory)

    try:
        transcription_service.transcribe_audio(session, audio_path, "pt-BR")
    except transcription_service.ProviderExecutionError as exc:
        message = str(exc)
    else:
        raise AssertionError("esperava ProviderExecutionError")

    assert message.startswith("Whisper falhou em todos os modelos")
    for model_name in ("small", "base", "tiny"):
        assert f"{model_name}: memoria insuficiente" in message

    session.close()
    engine.dispose()


def test_empty_exception_message_is_replaced_by_class_name() -> None:
    assert transcription_service.describe_error(RuntimeError()) == "RuntimeError"
    assert transcription_service.describe_error(MemoryError()) == "memoria insuficiente para carregar o modelo"
    assert transcription_service.describe_error(ValueError(" chave invalida ")) == "chave invalida"
