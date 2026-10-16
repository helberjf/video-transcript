import gc
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, TypeVar

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

T = TypeVar("T")

# Do mais pesado para o mais leve: e a ordem de queda quando um modelo nao carrega.
WHISPER_MODELS_BY_SIZE = ["large", "medium", "small", "base", "tiny"]
# Sem nenhuma API disponivel, o Whisper automatico usa no maximo este modelo.
AUTO_WHISPER_MODEL = "medium"


def describe_error(error: BaseException) -> str:
    """MemoryError() vem sem mensagem; sem isto o usuario via so 'ProviderExecutionError'."""
    if isinstance(error, MemoryError):
        return "memoria insuficiente para carregar o modelo"
    return str(error).strip() or error.__class__.__name__


def _run_with_retries(func: Callable[[], T], retries: int) -> T:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return func()
        except Exception as exc:
            last_error = exc
            if attempt >= retries:
                break
            time.sleep(min(2 * (attempt + 1), 5))
    raise ProviderExecutionError(describe_error(last_error) if last_error else "Falha no provedor")


def _whisper_size_rank(model_name: str) -> int:
    """Posicao em WHISPER_MODELS_BY_SIZE; large-v3, turbo e nomes desconhecidos contam como o mais pesado."""
    base_name = model_name.strip().lower().split(".")[0]
    if base_name in WHISPER_MODELS_BY_SIZE:
        return WHISPER_MODELS_BY_SIZE.index(base_name)
    return 0


def whisper_model_chain(model_name: str, max_model: str | None = None) -> list[str]:
    """Modelo escolhido (limitado a max_model) seguido de todos os mais leves que ele."""
    start = model_name.strip() or AUTO_WHISPER_MODEL
    if max_model and _whisper_size_rank(start) < _whisper_size_rank(max_model):
        start = max_model
    start_rank = _whisper_size_rank(start)
    lighter = [name for name in WHISPER_MODELS_BY_SIZE if _whisper_size_rank(name) > start_rank]
    return [start, *lighter]


def run_whisper_chain(run: Callable[[str], T], models: list[str]) -> T:
    """Tenta cada modelo uma vez: falta de memoria nao melhora repetindo o mesmo modelo."""
    failures: list[str] = []
    for index, model_name in enumerate(models):
        try:
            return run(model_name)
        except Exception as exc:
            detail = describe_error(exc)
            failures.append(f"{model_name}: {detail}")
            next_step = ", tentando um modelo mais leve" if index + 1 < len(models) else ""
            message = f"[whisper] modelo '{model_name}' falhou ({detail[:300]}){next_step}"
            logger.warning(message)
            print(message, flush=True)
            # Libera o que sobrou do modelo que nao coube antes de carregar o proximo.
            gc.collect()
    raise ProviderExecutionError("Whisper falhou em todos os modelos: " + "; ".join(failures))


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


def _log_provider_failure(provider: str, error: Exception) -> None:
    """A troca silenciosa de provedor escondia erros de rede, chave e TLS."""
    detail = describe_error(error)
    message = f"[transcricao] {provider} falhou, tentando o proximo provedor: {detail[:300]}"
    logger.warning(message)
    print(message, flush=True)


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

    selected_whisper_model = whisper_model_override or str(config.get("whisper_model") or settings.whisper_model)
    # Whisper pedido pelo usuario respeita o modelo escolhido; no automatico (sem API) vai no maximo ate o medium.
    whisper_forced = not use_api or _normalize_provider(transcription_provider_preference) == "whisper"
    whisper_models = whisper_model_chain(selected_whisper_model, None if whisper_forced else AUTO_WHISPER_MODEL)

    def transcribe_with_whisper() -> TranscriptionResult:
        return run_whisper_chain(lambda model_name: _transcribe_whisper(target_path, language, model_name), whisper_models)

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
                except Exception as exc:
                    _log_provider_failure("openai", exc)
                    continue

        if provider == "gemini":
            gemini_key = config.get("gemini_api_key")
            if isinstance(gemini_key, str) and gemini_key:
                try:
                    return _run_with_retries(lambda: _transcribe_gemini(target_path, language, gemini_key), retries)
                except Exception as exc:
                    _log_provider_failure("gemini", exc)
                    continue

        if provider == "whisper":
            return transcribe_with_whisper()

    return transcribe_with_whisper()
