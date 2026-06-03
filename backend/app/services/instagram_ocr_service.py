from __future__ import annotations

import base64
import io
import json
import logging
import os
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.instagram_analyze_job import InstagramAnalyzeJob
from app.repositories.instagram_analyze_job_repository import InstagramAnalyzeJobRepository
from app.schemas.instagram import (
    InstagramAnalyzeJobStatus,
    InstagramAnalyzeSlideResult,
    InstagramSlide,
)
from app.services.instagram_post_service import (
    _collect_slides,
    _extract_short_code,
    _used_cookies,
)
from app.services.settings_service import get_effective_provider_settings
from app.services.upload_service import (
    _build_ydl_options,
    _validate_remote_media_url,
    extract_remote_info_with_ssl_fallback,
)


logger = logging.getLogger(__name__)


VISION_PROVIDER_ORDER = ("gemini", "openai", "tesseract")
DEFAULT_VISION_OPENAI_MODEL = "gpt-4o-mini"
TESSERACT_LANGS = "por+eng"
DOWNLOAD_TIMEOUT_SECONDS = 30
MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0 Safari/537.36"
)


def _slides_to_payload(slides: list[InstagramAnalyzeSlideResult]) -> str:
    return json.dumps([slide.model_dump() for slide in slides], ensure_ascii=False)


def _slides_from_payload(raw: str | None) -> list[InstagramAnalyzeSlideResult]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [InstagramAnalyzeSlideResult(**item) for item in data if isinstance(item, dict)]


def _to_status(job: InstagramAnalyzeJob) -> InstagramAnalyzeJobStatus:
    return InstagramAnalyzeJobStatus(
        job_id=job.id,
        status=job.status,
        progress=float(job.progress or 0.0),
        current_slide=int(job.current_slide or 0),
        total_slides=int(job.total_slides or 0),
        error=job.error_message,
        slides=_slides_from_payload(job.slides_json),
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


def _persist_progress(
    db: Session,
    job: InstagramAnalyzeJob,
    *,
    status_value: str | None = None,
    progress: float | None = None,
    current_slide: int | None = None,
    total_slides: int | None = None,
    slides: list[InstagramAnalyzeSlideResult] | None = None,
    error: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> InstagramAnalyzeJob:
    if status_value is not None:
        job.status = status_value
    if progress is not None:
        job.progress = float(max(0.0, min(1.0, progress)))
    if current_slide is not None:
        job.current_slide = current_slide
    if total_slides is not None:
        job.total_slides = total_slides
    if slides is not None:
        job.slides_json = _slides_to_payload(slides)
    if error is not None:
        job.error_message = error
    if started_at is not None:
        job.started_at = started_at
    if completed_at is not None:
        job.completed_at = completed_at
    return InstagramAnalyzeJobRepository(db).save(job)


def _resolve_tesseract_binary() -> str | None:
    explicit = os.environ.get("TESSERACT_CMD")
    if explicit and Path(explicit).exists():
        return explicit

    found = shutil.which("tesseract")
    if found:
        return found

    candidates = [
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


def _ocr_with_gemini(image_bytes: bytes, mime_type: str, api_key: str) -> str:
    from google import genai
    from google.genai import types

    settings = get_settings()
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=settings.gemini_report_model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            (
                "Extraia literalmente todo o texto visivel desta imagem do Instagram. "
                "Preserve quebras de linha, listas e ordem original. "
                "Nao traduza, nao resuma, nao explique. "
                "Se nao houver texto, responda apenas: SEM_TEXTO."
            ),
        ],
    )
    text = (getattr(response, "text", None) or "").strip()
    if not text:
        raise RuntimeError("Gemini retornou OCR vazio")
    return text


def _ocr_with_openai(image_bytes: bytes, mime_type: str, api_key: str) -> str:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=api_key, timeout=settings.provider_timeout_seconds)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{encoded}"
    response = client.chat.completions.create(
        model=DEFAULT_VISION_OPENAI_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extraia literalmente todo o texto visivel desta imagem do Instagram. "
                            "Preserve quebras de linha, listas e ordem original. "
                            "Nao traduza, nao resuma, nao explique. "
                            "Se nao houver texto, responda apenas: SEM_TEXTO."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    )
    content = response.choices[0].message.content or ""
    text = content.strip()
    if not text:
        raise RuntimeError("OpenAI retornou OCR vazio")
    return text


def _ocr_with_tesseract(image_bytes: bytes) -> str:
    try:
        import pytesseract
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(f"Tesseract local indisponivel: {exc}") from exc

    binary = _resolve_tesseract_binary()
    if binary:
        pytesseract.pytesseract.tesseract_cmd = binary

    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as exc:
        raise RuntimeError(f"Imagem invalida para OCR local: {exc}") from exc

    try:
        text = pytesseract.image_to_string(image, lang=TESSERACT_LANGS)
    except pytesseract.TesseractNotFoundError as exc:
        raise RuntimeError(
            "Tesseract OCR nao esta instalado. Rode install-windows.ps1 ou instale 'UB-Mannheim.TesseractOCR'."
        ) from exc

    cleaned = (text or "").strip()
    if not cleaned:
        raise RuntimeError("Tesseract retornou OCR vazio")
    return cleaned


def _run_ocr_chain(
    image_bytes: bytes,
    mime_type: str,
    provider_settings: dict[str, Any],
) -> tuple[str, str]:
    last_error: Exception | None = None

    for provider in VISION_PROVIDER_ORDER:
        try:
            if provider == "gemini":
                key = provider_settings.get("gemini_api_key")
                if isinstance(key, str) and key.strip():
                    return _ocr_with_gemini(image_bytes, mime_type, key.strip()), provider
                continue

            if provider == "openai":
                key = provider_settings.get("openai_api_key")
                if isinstance(key, str) and key.strip():
                    return _ocr_with_openai(image_bytes, mime_type, key.strip()), provider
                continue

            if provider == "tesseract":
                return _ocr_with_tesseract(image_bytes), provider
        except Exception as exc:
            last_error = exc
            logger.warning("OCR provider %s falhou: %s", provider, exc)
            continue

    if last_error is not None:
        raise last_error
    raise RuntimeError("Nenhum provedor de OCR esta disponivel")


def _download_slide_bytes(url: str, referer: str | None) -> tuple[bytes, str]:
    headers = {"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"}
    if referer:
        headers["Referer"] = referer

    with httpx.Client(timeout=DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True, headers=headers) as client:
        response = client.get(url)
        response.raise_for_status()
        if len(response.content) > MAX_DOWNLOAD_BYTES:
            raise RuntimeError("Slide acima do limite permitido para OCR")
        mime_type = (response.headers.get("content-type") or "image/jpeg").split(";")[0].strip() or "image/jpeg"
        return response.content, mime_type


def _ensure_video_thumbnail(slide: InstagramSlide) -> str | None:
    if slide.media_kind == "video":
        return slide.thumbnail_url
    return slide.direct_url or slide.thumbnail_url


def _refresh_slides(url: str) -> list[InstagramSlide]:
    settings = get_settings()
    output_template = str(settings.uploads_dir / "instagram-analyze-%(id)s.%(ext)s")
    ydl_options = _build_ydl_options("instagram", output_template)
    ydl_options.update({"extract_flat": False, "skip_download": True})
    raw_info = extract_remote_info_with_ssl_fallback(
        "instagram", url, ydl_options, download=False,
    )
    if not isinstance(raw_info, dict):
        raise RuntimeError("Instagram nao retornou metadados do post")
    return _collect_slides(raw_info)


def start_analyze_job(db: Session, url: str, workspace_id: str) -> InstagramAnalyzeJobStatus:
    normalized_url = _validate_remote_media_url("instagram", url)

    job = InstagramAnalyzeJob(
        workspace_id=workspace_id,
        url=normalized_url,
        shortcode=_extract_short_code(normalized_url),
        status="queued",
        progress=0.0,
        current_slide=0,
        total_slides=0,
        slides_json=_slides_to_payload([]),
    )
    repository = InstagramAnalyzeJobRepository(db)
    job = repository.create(job)

    thread = threading.Thread(
        target=_run_job_in_background,
        args=(job.id, normalized_url, workspace_id),
        name=f"instagram-ocr-{job.id[:8]}",
        daemon=True,
    )
    thread.start()

    return _to_status(job)


def get_analyze_job(db: Session, job_id: str, workspace_id: str) -> InstagramAnalyzeJobStatus:
    repository = InstagramAnalyzeJobRepository(db)
    job = repository.get_for_workspace(job_id, workspace_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job de analise do Instagram nao encontrado",
        )
    return _to_status(job)


def _run_job_in_background(job_id: str, url: str, workspace_id: str) -> None:
    db = SessionLocal()
    try:
        repository = InstagramAnalyzeJobRepository(db)
        job = repository.get(job_id)
        if not job:
            return

        provider_settings = get_effective_provider_settings(db)
        _persist_progress(
            db, job,
            status_value="running",
            started_at=datetime.now(timezone.utc),
            progress=0.02,
        )

        try:
            slides = _refresh_slides(url)
        except Exception as exc:
            logger.exception("Falha ao listar slides do Instagram")
            _persist_progress(
                db, job,
                status_value="failed",
                error=f"Falha ao listar slides: {exc}",
                completed_at=datetime.now(timezone.utc),
            )
            return

        total = len(slides)
        if total == 0:
            _persist_progress(
                db, job,
                status_value="failed",
                error="Nenhum slide encontrado para o post.",
                completed_at=datetime.now(timezone.utc),
            )
            return

        results: list[InstagramAnalyzeSlideResult] = []
        _persist_progress(
            db, job,
            total_slides=total,
            slides=results,
            progress=0.05,
        )

        for index, slide in enumerate(slides):
            _persist_progress(
                db, job,
                current_slide=index + 1,
                progress=(index) / total + 0.001,
            )

            target_url = _ensure_video_thumbnail(slide)
            slide_result = InstagramAnalyzeSlideResult(
                index=slide.index,
                display_id=slide.display_id,
                media_kind=slide.media_kind,
                ocr_text=None,
                provider=None,
                error=None,
            )

            if not target_url:
                slide_result.error = "Slide sem URL acessivel para OCR"
                results.append(slide_result)
                _persist_progress(db, job, slides=results, progress=(index + 1) / total)
                continue

            try:
                image_bytes, mime_type = _download_slide_bytes(target_url, referer=url)
                ocr_text, provider = _run_ocr_chain(image_bytes, mime_type, provider_settings)
                slide_result.ocr_text = ocr_text
                slide_result.provider = provider
            except Exception as exc:
                logger.exception("Falha ao processar slide %s", index)
                slide_result.error = str(exc)

            results.append(slide_result)
            _persist_progress(db, job, slides=results, progress=(index + 1) / total)

        _persist_progress(
            db, job,
            status_value="done",
            progress=1.0,
            completed_at=datetime.now(timezone.utc),
            slides=results,
        )
    except Exception as exc:
        logger.exception("Erro inesperado no worker de OCR do Instagram")
        try:
            repository = InstagramAnalyzeJobRepository(db)
            job = repository.get(job_id)
            if job:
                _persist_progress(
                    db, job,
                    status_value="failed",
                    error=f"Erro inesperado: {exc}",
                    completed_at=datetime.now(timezone.utc),
                )
        except Exception:
            logger.exception("Falha ao registrar erro no job")
    finally:
        db.close()


def used_cookies_for_analyze() -> bool:
    return _used_cookies()
