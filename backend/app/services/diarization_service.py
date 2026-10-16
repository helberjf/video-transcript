"""Transcricao com separacao por falante (diarizacao) para reunioes gravadas."""

import json
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.enums import TranscriptionEngine
from app.services.settings_service import get_effective_provider_settings
from app.services.transcription_service import (
    AUTO_WHISPER_MODEL,
    ProviderExecutionError,
    _configured_transcription_provider_order,
    _language_hint,
    _log_provider_failure,
    _run_with_retries,
    run_whisper_chain,
    whisper_model_chain,
)


logger = logging.getLogger("diarization")

OPENAI_DIARIZE_MODEL = "gpt-4o-transcribe-diarize"
# Limite de arquivo da API de transcricao da OpenAI.
OPENAI_MAX_BYTES = 25 * 1024 * 1024


@dataclass
class Segment:
    start: float
    end: float
    text: str
    speaker: str | None = None


@dataclass
class DiarizedTranscription:
    segments: list[Segment]
    engine: TranscriptionEngine
    language_detected: str | None
    has_speaker_labels: bool
    metadata: dict[str, Any] = field(default_factory=dict)


def _field(item: Any, name: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def _diarize_openai(audio_path: Path, language: str | None, api_key: str) -> DiarizedTranscription:
    from openai import OpenAI

    if audio_path.stat().st_size > OPENAI_MAX_BYTES:
        raise ProviderExecutionError("Audio acima de 25 MB para a OpenAI")

    settings = get_settings()
    client = OpenAI(api_key=api_key, timeout=max(settings.provider_timeout_seconds, 600))
    with audio_path.open("rb") as audio_file:
        response = client.audio.transcriptions.create(
            model=OPENAI_DIARIZE_MODEL,
            file=audio_file,
            language=_language_hint(language),
            response_format="diarized_json",
            chunking_strategy="auto",
        )

    segments = [
        Segment(
            start=float(_field(item, "start", 0) or 0),
            end=float(_field(item, "end", 0) or 0),
            text=str(_field(item, "text", "") or "").strip(),
            speaker=str(_field(item, "speaker", "") or "") or None,
        )
        for item in (_field(response, "segments", None) or [])
    ]
    segments = [segment for segment in segments if segment.text]
    if not segments:
        raise ProviderExecutionError("OpenAI retornou transcricao vazia")
    return DiarizedTranscription(
        segments=segments,
        engine=TranscriptionEngine.OPENAI,
        language_detected=language,
        has_speaker_labels=True,
        metadata={"model": OPENAI_DIARIZE_MODEL},
    )


GEMINI_DIARIZE_PROMPT = (
    "Transcreva esta gravacao de reuniao com maxima fidelidade, separando por falante. "
    "Responda SOMENTE com um array JSON, sem texto antes ou depois, no formato "
    '[{"start": 0.0, "end": 4.2, "speaker": "A", "text": "..."}]. '
    "start e end sao segundos desde o inicio do audio. Use letras (A, B, C...) para os falantes, "
    "sempre a mesma letra para a mesma voz do inicio ao fim. Comece um item novo a cada troca de falante "
    "ou a cada ~30 segundos de fala continua. Nao resuma, nao traduza, nao invente nomes. "
)


def _parse_json_array(raw: str) -> list[dict[str, Any]]:
    cleaned = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fenced:
        cleaned = fenced.group(1).strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start < 0 or end <= start:
        raise ProviderExecutionError("Resposta sem JSON")
    data = json.loads(cleaned[start : end + 1])
    if not isinstance(data, list):
        raise ProviderExecutionError("JSON inesperado")
    return [item for item in data if isinstance(item, dict)]


def _seconds(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if ":" in text:
        total = 0.0
        for part in text.split(":"):
            total = total * 60 + float(part or 0)
        return total
    try:
        return float(text)
    except ValueError:
        return 0.0


def _diarize_gemini(audio_path: Path, language: str | None, api_key: str) -> DiarizedTranscription:
    from google import genai

    settings = get_settings()
    client = genai.Client(api_key=api_key)
    uploaded = client.files.upload(file=str(audio_path))
    while getattr(uploaded.state, "name", "") == "PROCESSING":
        time.sleep(2)
        uploaded = client.files.get(name=uploaded.name)

    prompt = GEMINI_DIARIZE_PROMPT + f"Idioma preferencial: {language or 'detectar automaticamente'}."
    response = client.models.generate_content(
        model=settings.gemini_transcription_model,
        contents=[prompt, uploaded],
        config={"response_mime_type": "application/json"},
    )
    items = _parse_json_array(getattr(response, "text", None) or "")
    segments = [
        Segment(
            start=_seconds(item.get("start")),
            end=_seconds(item.get("end")),
            text=str(item.get("text") or "").strip(),
            speaker=str(item.get("speaker") or "").strip() or None,
        )
        for item in items
    ]
    segments = [segment for segment in segments if segment.text]
    if not segments:
        raise ProviderExecutionError("Gemini retornou transcricao vazia")
    return DiarizedTranscription(
        segments=segments,
        engine=TranscriptionEngine.GEMINI,
        language_detected=language,
        has_speaker_labels=True,
        metadata={"model": settings.gemini_transcription_model},
    )


def _transcribe_whisper_segments(audio_path: Path, language: str | None, model_name: str) -> DiarizedTranscription:
    import torch
    import whisper

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisper.load_model(model_name, device=device)
    result = model.transcribe(str(audio_path), language=_language_hint(language), fp16=device == "cuda")
    segments = [
        Segment(start=float(item.get("start", 0)), end=float(item.get("end", 0)), text=str(item.get("text", "")).strip())
        for item in result.get("segments") or []
    ]
    segments = [segment for segment in segments if segment.text]
    if not segments:
        raise ProviderExecutionError("Whisper retornou transcricao vazia")
    # Whisper nao separa falantes: a separacao "Voce" x "Participantes" vem dos canais da gravacao.
    return DiarizedTranscription(
        segments=segments,
        engine=TranscriptionEngine.WHISPER,
        language_detected=result.get("language") or language,
        has_speaker_labels=False,
        metadata={"model": model_name, "device": device},
    )


def transcribe_with_speakers(db: Session, audio_path: str | Path, language: str | None) -> DiarizedTranscription:
    settings = get_settings()
    config = get_effective_provider_settings(db)
    target = Path(audio_path)
    retries = settings.provider_retries

    for provider in _configured_transcription_provider_order(config):
        if provider == "openai":
            key = config.get("openai_api_key")
            if isinstance(key, str) and key:
                try:
                    return _run_with_retries(lambda: _diarize_openai(target, language, key), retries)
                except Exception as exc:
                    _log_provider_failure("openai-diarize", exc)
        elif provider == "gemini":
            key = config.get("gemini_api_key")
            if isinstance(key, str) and key:
                try:
                    return _run_with_retries(lambda: _diarize_gemini(target, language, key), retries)
                except Exception as exc:
                    _log_provider_failure("gemini-diarize", exc)
        elif provider == "whisper":
            break

    whisper_model = str(config.get("whisper_model") or settings.whisper_model)
    return run_whisper_chain(
        lambda model_name: _transcribe_whisper_segments(target, language, model_name),
        whisper_model_chain(whisper_model, AUTO_WHISPER_MODEL),
    )
