import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.enums import TranscriptionEngine
from app.services.settings_service import get_effective_provider_settings


class ProviderExecutionError(RuntimeError):
    pass


@dataclass
class TranscriptionResult:
    text: str
    engine: TranscriptionEngine
    language_detected: str | None
    metadata: dict[str, Any]


def _run_with_retries(func: Callable[[], TranscriptionResult], retries: int) -> TranscriptionResult:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return func()
        except Exception as exc:
            last_error = exc
            if attempt >= retries:
                break
            time.sleep(min(2 * (attempt + 1), 5))
    raise ProviderExecutionError(str(last_error) if last_error else "Falha no provedor")


def _language_hint(language: str | None) -> str | None:
    if not language:
        return None
    normalized = language.split("-")[0].strip().lower()
    return normalized or None


def _transcribe_openai(audio_path: Path, language: str | None, api_key: str) -> TranscriptionResult:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=api_key, timeout=settings.provider_timeout_seconds)
    with audio_path.open("rb") as audio_file:
        response = client.audio.transcriptions.create(
            model=settings.openai_transcription_model,
            file=audio_file,
            language=_language_hint(language),
        )
    text = getattr(response, "text", None) or ""
    if not text.strip():
        raise ProviderExecutionError("OpenAI retornou transcrição vazia")
    return TranscriptionResult(
        text=text.strip(),
        engine=TranscriptionEngine.OPENAI,
        language_detected=getattr(response, "language", None) or language,
        metadata={"model": settings.openai_transcription_model},
    )


def _transcribe_gemini(audio_path: Path, language: str | None, api_key: str) -> TranscriptionResult:
    from google import genai

    settings = get_settings()
    client = genai.Client(api_key=api_key)
    uploaded = client.files.upload(file=str(audio_path))
    while getattr(uploaded.state, "name", "") == "PROCESSING":
        time.sleep(2)
        uploaded = client.files.get(name=uploaded.name)
    prompt = (
        "Transcreva o arquivo de áudio com máxima fidelidade, mantendo nomes, números e estrutura. "
        f"Idioma preferencial: {language or 'auto-detect'}"
    )
    response = client.models.generate_content(
        model=settings.gemini_transcription_model,
        contents=[prompt, uploaded],
    )
    text = getattr(response, "text", None) or ""
    if not text.strip():
        raise ProviderExecutionError("Gemini retornou transcrição vazia")
    return TranscriptionResult(
        text=text.strip(),
        engine=TranscriptionEngine.GEMINI,
        language_detected=language,
        metadata={"model": settings.gemini_transcription_model},
    )


def _transcribe_whisper(audio_path: Path, language: str | None, model_name: str) -> TranscriptionResult:
    import whisper

    model = whisper.load_model(model_name)
    result = model.transcribe(str(audio_path), language=_language_hint(language))
    text = (result.get("text") or "").strip()
    if not text:
        raise ProviderExecutionError("Whisper retornou transcrição vazia")
    return TranscriptionResult(
        text=text,
        engine=TranscriptionEngine.WHISPER,
        language_detected=result.get("language") or language,
        metadata={"model": model_name},
    )


def transcribe_audio(db: Session, audio_path: str | Path, language: str | None = None) -> TranscriptionResult:
    settings = get_settings()
    config = get_effective_provider_settings(db)
    target_path = Path(audio_path)
    retries = settings.provider_retries

    openai_key = config.get("openai_api_key")
    if isinstance(openai_key, str) and openai_key:
        try:
            return _run_with_retries(lambda: _transcribe_openai(target_path, language, openai_key), retries)
        except Exception:
            pass

    gemini_key = config.get("gemini_api_key")
    if isinstance(gemini_key, str) and gemini_key:
        try:
            return _run_with_retries(lambda: _transcribe_gemini(target_path, language, gemini_key), retries)
        except Exception:
            pass

    whisper_model = str(config.get("whisper_model") or settings.whisper_model)
    return _run_with_retries(lambda: _transcribe_whisper(target_path, language, whisper_model), retries)
