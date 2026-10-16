"""Leitura de imagens e PDFs (inclusive escaneados e manuscritos) pela IA de visao configurada.

Funciona com Gemini, OpenAI ou Claude, na ordem de provedores de relatorio dos Ajustes.
"""

import base64
import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.settings_service import get_effective_provider_settings


logger = logging.getLogger("vision")

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
PDF_TYPE = "application/pdf"


@dataclass
class VisionFile:
    data: bytes
    mime_type: str
    name: str = "arquivo"


class VisionUnavailableError(RuntimeError):
    pass


def normalize_mime(mime_type: str | None, filename: str | None = None) -> str:
    mime = (mime_type or "").split(";")[0].strip().lower()
    name = (filename or "").lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    if mime in IMAGE_TYPES or mime == PDF_TYPE:
        return mime
    if name.endswith(".pdf"):
        return PDF_TYPE
    for extension, guessed in ((".png", "image/png"), (".jpg", "image/jpeg"), (".jpeg", "image/jpeg"), (".webp", "image/webp")):
        if name.endswith(extension):
            return guessed
    return mime


def _gemini(prompt: str, files: list[VisionFile], api_key: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    parts = [types.Part.from_bytes(data=item.data, mime_type=item.mime_type) for item in files]
    response = client.models.generate_content(model=get_settings().gemini_report_model, contents=[*parts, prompt])
    return (getattr(response, "text", None) or "").strip()


def _openai(prompt: str, files: list[VisionFile], api_key: str) -> str:
    from openai import OpenAI

    settings = get_settings()
    content: list[dict] = [{"type": "text", "text": prompt}]
    for item in files:
        encoded = base64.b64encode(item.data).decode("ascii")
        if item.mime_type == PDF_TYPE:
            content.append({"type": "file", "file": {"filename": item.name or "documento.pdf", "file_data": f"data:{PDF_TYPE};base64,{encoded}"}})
        else:
            content.append({"type": "image_url", "image_url": {"url": f"data:{item.mime_type};base64,{encoded}"}})
    client = OpenAI(api_key=api_key, timeout=max(settings.provider_timeout_seconds, 180))
    response = client.chat.completions.create(model=settings.openai_report_model, messages=[{"role": "user", "content": content}])
    return (response.choices[0].message.content or "").strip()


def _claude(prompt: str, files: list[VisionFile], api_key: str) -> str:
    from anthropic import Anthropic

    settings = get_settings()
    content: list[dict] = []
    for item in files:
        encoded = base64.b64encode(item.data).decode("ascii")
        block_type = "document" if item.mime_type == PDF_TYPE else "image"
        content.append({"type": block_type, "source": {"type": "base64", "media_type": item.mime_type, "data": encoded}})
    content.append({"type": "text", "text": prompt})
    client = Anthropic(api_key=api_key, timeout=max(settings.provider_timeout_seconds, 180))
    response = client.messages.create(
        model=settings.claude_report_model,
        max_tokens=8192,
        messages=[{"role": "user", "content": content}],
    )
    return "\n".join(getattr(block, "text", "") for block in response.content).strip()


PROVIDERS = {"gemini": _gemini, "openai": _openai, "claude": _claude}


def read_with_vision(db: Session, prompt: str, files: list[VisionFile]) -> tuple[str, str]:
    """Devolve (texto da IA, provedor). Tenta cada provedor com chave, na ordem dos Ajustes."""
    config = get_effective_provider_settings(db)
    order = [str(item) for item in (config.get("report_provider_order") or [])]
    order += [name for name in ("gemini", "openai", "claude") if name not in order]
    errors: list[str] = []
    for provider in order:
        run = PROVIDERS.get(provider)
        key = config.get(f"{provider}_api_key")
        if not run or not isinstance(key, str) or not key:
            continue
        try:
            text = run(prompt, files, key)
        except Exception as exc:
            detail = str(exc).strip()[:300] or exc.__class__.__name__
            errors.append(f"{provider}: {detail}")
            logger.warning("[visao] %s falhou: %s", provider, detail)
            print(f"[visao] {provider} falhou: {detail}", flush=True)
            continue
        if text:
            return text, provider
    if errors:
        raise VisionUnavailableError("A IA nao conseguiu ler o arquivo. " + "; ".join(errors))
    raise VisionUnavailableError("Configure uma chave do Gemini, OpenAI ou Claude em Ajustes para a IA ler imagens e PDFs.")
