import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.enums import TranscriptionEngine
from app.services.settings_service import get_effective_provider_settings


logger = logging.getLogger("transcription")


class ProviderExecutionError(RuntimeError):
    pass


@dataclass
class TranscriptionResult:
    text: str
    engine: TranscriptionEngine
    language_detected: str | None
    metadata: dict[str, Any]


TranscriptionProviderName = Literal["openai", "gemini", "whisper"]


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


def _normalize_provider(provider: str | None) -> TranscriptionProviderName | None:
    if not provider:
        return None
    normalized = provider.strip().lower()
    if normalized in {"openai", "gemini", "whisper"}:
        return normalized
    return None


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
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    use_fp16 = device == "cuda"

    logger.info("[whisper] carregando modelo '%s' em %s", model_name, device)
    print(f"[whisper] carregando modelo '{model_name}' em {device}", flush=True)
    model = whisper.load_model(model_name, device=device)

    logger.info("[whisper] iniciando transcricao de %s (fp16=%s)", audio_path.name, use_fp16)
    print(f"[whisper] iniciando transcricao de {audio_path.name} (fp16={use_fp16})", flush=True)
    start = time.monotonic()
    result = model.transcribe(
        str(audio_path),
        language=_language_hint(language),
        fp16=use_fp16,
        verbose=True,
    )
    elapsed = time.monotonic() - start
    logger.info("[whisper] transcricao concluida em %.1fs", elapsed)
    print(f"[whisper] transcricao concluida em {elapsed:.1f}s", flush=True)

    text = (result.get("text") or "").strip()
    if not text:
        raise ProviderExecutionError("Whisper retornou transcrição vazia")
    return TranscriptionResult(
        text=text,
        engine=TranscriptionEngine.WHISPER,
        language_detected=result.get("language") or language,
        metadata={"model": model_name, "device": device},
    )


def _configured_transcription_provider_order(config: dict[str, Any]) -> list[TranscriptionProviderName]:
    raw_order = config.get("transcription_provider_order")
    if isinstance(raw_order, list):
        normalized = [_normalize_provider(str(item)) for item in raw_order]
        filtered = [item for item in normalized if item is not None]
        if filtered:
            return filtered

    return ["openai", "gemini", "whisper"]


def _transcription_provider_order(
    config: dict[str, Any],
    use_api: bool,
    preferred_provider: str | None = None,
) -> list[TranscriptionProviderName]:
    if not use_api:
        return ["whisper"]

    normalized_preference = _normalize_provider(preferred_provider)
    if normalized_preference == "whisper":
        return ["whisper"]

    configured_order = _configured_transcription_provider_order(config)
    if normalized_preference is None:
        return configured_order

    return [normalized_preference, *[provider for provider in configured_order if provider != normalized_preference]]


def transcribe_audio(
    db: Session,
    audio_path: str | Path,
    language: str | None = None,
    *,
    use_api: bool = True,
    whisper_model_override: str | None = None,
    transcription_provider_preference: str | None = None,
) -> TranscriptionResult:
    settings = get_settings()
    config = get_effective_provider_settings(db)
    target_path = Path(audio_path)
    retries = settings.provider_retries

    for provider in _transcription_provider_order(
        config,
        use_api=use_api,
        preferred_provider=transcription_provider_preference,
    ):
        if provider == "openai":
            openai_key = config.get("openai_api_key")
            if isinstance(openai_key, str) and openai_key:
                try:
                    return _run_with_retries(lambda: _transcribe_openai(target_path, language, openai_key), retries)
                except Exception:
                    continue

        if provider == "gemini":
            gemini_key = config.get("gemini_api_key")
            if isinstance(gemini_key, str) and gemini_key:
                try:
                    return _run_with_retries(lambda: _transcribe_gemini(target_path, language, gemini_key), retries)
                except Exception:
                    continue

        if provider == "whisper":
            whisper_model = whisper_model_override or str(config.get("whisper_model") or settings.whisper_model)
            return _run_with_retries(lambda: _transcribe_whisper(target_path, language, whisper_model), retries)

    whisper_model = whisper_model_override or str(config.get("whisper_model") or settings.whisper_model)
    return _run_with_retries(lambda: _transcribe_whisper(target_path, language, whisper_model), retries)
