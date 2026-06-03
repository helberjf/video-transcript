from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status

from app.schemas.instagram import InstagramPostInfo, InstagramPostReadResponse, InstagramSlide
from app.services.upload_service import (
    _build_ydl_options,
    _remote_download_error_message,
    _resolve_cookies_file,
    _validate_remote_media_url,
    extract_remote_info_with_ssl_fallback,
)


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_text(info: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = _as_text(info.get(key))
        if value:
            return value
    return None


def _extract_short_code(url: str) -> str | None:
    match = re.search(r"instagram\.com/(?:p|reel|tv)/([^/?#]+)", url, re.IGNORECASE)
    if not match:
        match = re.search(r"instagram\.com/share/reel/([^/?#]+)", url, re.IGNORECASE)
    if not match:
        match = re.search(r"instagram\.com/stories/[^/]+/([0-9]+)", url, re.IGNORECASE)
    return match.group(1) if match else None


def _source_type_from_url(url: str) -> str:
    if "/reel/" in url or "/share/reel/" in url:
        return "reel"
    if "/stories/" in url:
        return "story"
    if "/tv/" in url:
        return "tv"
    return "post"


def _unique_terms(pattern: str, text: str | None) -> list[str]:
    if not text:
        return []
    seen: set[str] = set()
    terms: list[str] = []
    for match in re.finditer(pattern, text, re.UNICODE):
        term = match.group(1).strip("._").lower()
        if term and term not in seen:
            seen.add(term)
            terms.append(term)
    return terms[:40]


def _compact_text(value: str | None, max_length: int = 900) -> str:
    text = re.sub(r"\s+", " ", value or "").strip()
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 3].rstrip()}..."


def _pick_entry(info: dict[str, Any]) -> dict[str, Any]:
    entries = info.get("entries")
    if isinstance(entries, list) and entries and isinstance(entries[0], dict):
        return entries[0]
    return info


def _entry_media_kind(entry: dict[str, Any]) -> str:
    duration = _as_float(entry.get("duration"))
    if duration and duration > 0:
        return "video"
    if entry.get("vcodec") and entry.get("vcodec") != "none":
        return "video"
    return "imagem"


def _entry_direct_url(entry: dict[str, Any]) -> str | None:
    direct = _as_text(entry.get("url"))
    if direct:
        return direct

    formats = entry.get("formats")
    if isinstance(formats, list):
        for fmt in reversed(formats):
            if not isinstance(fmt, dict):
                continue
            url = _as_text(fmt.get("url"))
            if url:
                return url
    return None


def _collect_slides(raw_info: dict[str, Any]) -> list[InstagramSlide]:
    entries = raw_info.get("entries")
    if isinstance(entries, list) and entries:
        candidates = [entry for entry in entries if isinstance(entry, dict)]
    else:
        candidates = [raw_info]

    slides: list[InstagramSlide] = []
    for index, entry in enumerate(candidates):
        slides.append(
            InstagramSlide(
                index=index,
                display_id=_first_text(entry, "id", "display_id"),
                media_kind=_entry_media_kind(entry),
                thumbnail_url=_first_text(entry, "thumbnail"),
                direct_url=_entry_direct_url(entry),
                duration_seconds=_as_float(entry.get("duration")),
            )
        )
    return slides


def _used_cookies() -> bool:
    return bool(
        _resolve_cookies_file()
        or os.environ.get("INSTAGRAM_COOKIES_FROM_BROWSER")
        or os.environ.get("YTDLP_COOKIES_FROM_BROWSER")
    )


def _build_raw_summary(post: InstagramPostInfo) -> str:
    metrics = []
    if post.view_count is not None:
        metrics.append(f"{post.view_count} visualizacoes")
    if post.like_count is not None:
        metrics.append(f"{post.like_count} curtidas")
    if post.comment_count is not None:
        metrics.append(f"{post.comment_count} comentarios")

    lines = [
        f"Tipo: {post.source_type}",
        f"Autor: {post.author or 'nao identificado'}",
        f"Midia: {post.media_kind}",
    ]
    if len(post.slides) > 1:
        lines.append(f"Slides: {len(post.slides)}")
    if post.title:
        lines.append(f"Titulo: {_compact_text(post.title, 260)}")
    if post.caption:
        lines.append(f"Legenda: {_compact_text(post.caption, 1200)}")
    if post.hashtags:
        lines.append(f"Hashtags: {', '.join(f'#{tag}' for tag in post.hashtags[:20])}")
    if post.mentions:
        lines.append(f"Mencoes: {', '.join(f'@{mention}' for mention in post.mentions[:20])}")
    if metrics:
        lines.append(f"Metricas: {', '.join(metrics)}")
    if post.duration_seconds is not None:
        lines.append(f"Duracao: {post.duration_seconds:.0f} segundos")
    return "\n".join(lines)


def _build_suggestions(post: InstagramPostInfo) -> list[str]:
    suggestions = [
        "Definir a promessa principal em uma frase curta antes de gerar o programa.",
        "Separar o fluxo em telas, entradas do usuario, processamento e saida final.",
        "Criar uma etapa de revisao para o usuario aprovar antes de exportar ou executar qualquer resultado.",
    ]

    caption_length = len(post.caption or "")
    if caption_length > 800:
        suggestions.append("Resumir a legenda longa em requisitos funcionais e regras de negocio objetivas.")
    elif caption_length < 140:
        suggestions.append("Adicionar contexto extra sobre publico-alvo, problema resolvido e resultado esperado.")

    if post.media_kind == "video":
        suggestions.append("Mapear cada cena ou demonstracao do video como uma funcionalidade do programa.")

    if post.hashtags:
        suggestions.append("Usar as hashtags apenas como contexto de mercado, sem transformar tags em funcionalidades soltas.")
    else:
        suggestions.append("Acrescentar palavras-chave do nicho para orientar melhor a IA que vai gerar o programa.")

    if post.like_count is not None or post.view_count is not None:
        suggestions.append("Converter as metricas do post em sinais de prioridade, nao em requisitos obrigatorios.")

    return suggestions[:7]


def _build_prompt_seed(post: InstagramPostInfo, suggestions: list[str]) -> str:
    suggestion_text = "\n".join(f"- {item}" for item in suggestions[:5])
    return "\n".join(
        [
            "Crie um programa inspirado na solucao apresentada neste post do Instagram.",
            "",
            "Objetivo: reproduzir a solucao funcional, o fluxo de uso e o valor entregue, sem copiar marca, identidade visual, textos protegidos ou ativos privados do post original.",
            "",
            "Informacoes lidas do post:",
            post.raw_summary,
            "",
            "Diretrizes iniciais:",
            suggestion_text,
            "",
            "Entregue um plano de produto e um prompt tecnico completo para uma IA gerar o programa.",
        ]
    )


def inspect_instagram_post(url: str) -> InstagramPostReadResponse:
    normalized_url = _validate_remote_media_url("instagram", url)

    ydl_options = _build_ydl_options("instagram", "%(id)s.%(ext)s")
    ydl_options.update(
        {
            "extract_flat": False,
            "skip_download": True,
        }
    )

    try:
        raw_info = extract_remote_info_with_ssl_fallback(
            "instagram",
            normalized_url,
            ydl_options,
            download=False,
        )
    except HTTPException:
        raise
    except Exception as exc:
        message = _remote_download_error_message("instagram", exc).replace("baixar a midia", "ler o post")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message) from exc

    if not isinstance(raw_info, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Instagram nao retornou metadados do post")

    slides = _collect_slides(raw_info)
    info = _pick_entry(raw_info)
    caption = _first_text(info, "description", "caption", "fulltitle") or _first_text(raw_info, "description", "caption", "fulltitle")
    title = _first_text(info, "title", "alt_title") or _first_text(raw_info, "title", "alt_title")
    canonical_url = _first_text(info, "webpage_url", "original_url") or _first_text(raw_info, "webpage_url", "original_url") or normalized_url
    duration = _as_float(info.get("duration"))
    if len(slides) > 1:
        media_kind = "carrossel"
    elif duration and duration > 0:
        media_kind = "video"
    else:
        media_kind = "imagem"

    post = InstagramPostInfo(
        url=normalized_url,
        canonical_url=canonical_url,
        source_type=_source_type_from_url(normalized_url),
        shortcode=_first_text(info, "id", "display_id") or _extract_short_code(normalized_url),
        title=title,
        caption=caption,
        author=_first_text(info, "uploader", "channel", "creator", "artist"),
        author_id=_first_text(info, "uploader_id", "channel_id", "creator_id"),
        media_kind=media_kind,
        duration_seconds=duration,
        view_count=_as_int(info.get("view_count")),
        like_count=_as_int(info.get("like_count")),
        comment_count=_as_int(info.get("comment_count")),
        upload_date=_first_text(info, "upload_date", "release_date"),
        thumbnail_url=_first_text(info, "thumbnail"),
        hashtags=_unique_terms(r"(?<!\w)#([\wÀ-ÖØ-öø-ÿ0-9_]+)", caption),
        mentions=_unique_terms(r"(?<!\w)@([A-Za-z0-9._]+)", caption),
        raw_summary="",
        slides=slides,
    )
    post.raw_summary = _build_raw_summary(post)
    suggestions = _build_suggestions(post)

    return InstagramPostReadResponse(
        post=post,
        suggestions=suggestions,
        confirmation_question="Essas informacoes representam o post e a solucao que voce quer transformar em programa?",
        prompt_seed=_build_prompt_seed(post, suggestions),
        used_cookies=_used_cookies(),
        inspected_at=datetime.now(timezone.utc),
    )
