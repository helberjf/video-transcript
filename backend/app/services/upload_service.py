import mimetypes
import os
import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.upload import Upload
from app.repositories.upload_repository import UploadRepository
from app.schemas.upload import RemoteMediaSource
from app.schemas.upload import UploadStatsResponse
from app.utils.files import detect_media_type, safe_unlink, save_upload_file, validate_upload


def create_upload(db: Session, upload_file: UploadFile, workspace_id: str = "local-workspace") -> Upload:
    settings = get_settings()

    if not upload_file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo inválido")

    try:
        file_type = validate_upload(upload_file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    saved_path, stored_filename, mime_type = save_upload_file(upload_file)
    file_size = saved_path.stat().st_size
    if file_size > settings.max_upload_bytes:
        safe_unlink(saved_path)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo excede o limite de {settings.max_upload_mb} MB",
        )

    upload = Upload(
        workspace_id=workspace_id,
        original_filename=Path(upload_file.filename).name,
        stored_filename=stored_filename,
        file_type=file_type,
        mime_type=mime_type,
        original_path=str(saved_path),
        upload_size_bytes=file_size,
    )
    repository = UploadRepository(db)
    return repository.create(upload)


def _parse_cookies_from_browser(value: str | None) -> tuple[str, ...] | None:
    if not value or not isinstance(value, str):
        return None

    parts = [part.strip() for part in value.split(":", 1)]
    browser = parts[0]
    profile = parts[1].strip() if len(parts) > 1 and parts[1] else None
    if not browser:
        return None
    return (browser, profile) if profile else (browser,)


def _build_ydl_options(source: RemoteMediaSource, output_template: str) -> dict[str, Any]:
    settings = get_settings()
    cookies_from_browser = (
        os.environ.get("INSTAGRAM_COOKIES_FROM_BROWSER")
        or os.environ.get("YTDLP_COOKIES_FROM_BROWSER")
    )
    cookies_file = (
        os.environ.get("INSTAGRAM_COOKIES_FILE")
        or os.environ.get("YTDLP_COOKIES_FILE")
    )
    default_cookies_path = Path(settings.temp_dir) / "cookies.txt"
    if not cookies_file and default_cookies_path.exists():
        cookies_file = str(default_cookies_path)

    ydl_options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "outtmpl": output_template,
        "windowsfilenames": True,
    }

    if source == "youtube":
        ydl_options["format"] = "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b"
        ydl_options["merge_output_format"] = "mp4"
    else:
        ydl_options["format"] = "best[ext=mp4]/best"

    if cookies_file and Path(cookies_file).exists():
        ydl_options["cookiefile"] = cookies_file
    else:
        parsed_cookies = _parse_cookies_from_browser(cookies_from_browser)
        if parsed_cookies:
            ydl_options["cookiesfrombrowser"] = parsed_cookies

    return ydl_options


def _validate_remote_media_url(source: RemoteMediaSource, url: str) -> str:
    normalized = url.strip()
    patterns = {
        "youtube": (
            r"^https?://(www\.)?(youtube\.com/watch\?v=|youtube\.com/shorts/|youtube\.com/live/|youtu\.be/)[A-Za-z0-9_-]+",
        ),
        "instagram": (
            r"^https?://(www\.)?instagram\.com/(p|reel|tv)/[A-Za-z0-9._-]+",
            r"^https?://(www\.)?instagram\.com/share/reel/[A-Za-z0-9._-]+",
            r"^https?://(www\.)?instagram\.com/stories/[A-Za-z0-9._-]+/[0-9]+",
        ),
    }
    if any(re.match(pattern, normalized, re.IGNORECASE) for pattern in patterns[source]):
        return normalized

    source_label = "YouTube" if source == "youtube" else "Instagram"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"URL invalida para {source_label}",
    )


def _sanitize_title(value: str, fallback: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]+', " ", value).strip()
    collapsed = re.sub(r"\s+", " ", cleaned)
    return (collapsed[:140] or fallback).strip()


def _cleanup_remote_downloads(download_prefix: str) -> None:
    settings = get_settings()
    for candidate in settings.uploads_dir.glob(f"{download_prefix}*"):
        if candidate.is_file():
            safe_unlink(candidate)


def _find_downloaded_media_path(download_prefix: str) -> Path:
    settings = get_settings()
    candidates = [
        path
        for path in settings.uploads_dir.glob(f"{download_prefix}.*")
        if path.is_file() and not path.name.endswith(".part")
    ]
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nao foi possivel localizar o arquivo baixado",
        )
    return max(candidates, key=lambda path: path.stat().st_mtime)


def _remote_download_error_message(source: RemoteMediaSource, error: Exception) -> str:
    source_label = "YouTube" if source == "youtube" else "Instagram"
    raw_message = str(error).strip()
    compact_message = re.sub(r"\s+", " ", raw_message)

    if "requested format is not available" in compact_message.lower():
        return f"{source_label} nao disponibilizou um formato compativel para download. Atualize o yt-dlp ou tente outro link."

    if any(fragment in compact_message.lower() for fragment in ("sign in", "login", "cookies", "private video", "confirm your age")):
        return f"{source_label} pediu login/cookies para acessar essa midia. Configure YTDLP_COOKIES_FILE ou tente um video publico."

    if "video unavailable" in compact_message.lower():
        return f"{source_label} informou que o video esta indisponivel para este link."

    if compact_message:
        return f"Falha ao baixar a midia de {source_label}: {compact_message[:500]}"

    return f"Falha ao baixar a midia de {source_label}"


def create_upload_from_remote_url(db: Session, source: RemoteMediaSource, url: str, workspace_id: str = "local-workspace") -> Upload:
    settings = get_settings()
    normalized_url = _validate_remote_media_url(source, url)
    download_prefix = f"remote-{os.urandom(4).hex()}"
    output_template = str(settings.uploads_dir / f"{download_prefix}.%(ext)s")

    try:
        import yt_dlp
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="yt-dlp nao esta instalado no backend",
        ) from exc

    info: dict[str, Any] | None = None
    try:
        with yt_dlp.YoutubeDL(_build_ydl_options(source, output_template)) as downloader:
            info = downloader.extract_info(normalized_url, download=True)

        downloaded_path = _find_downloaded_media_path(download_prefix)
        file_size = downloaded_path.stat().st_size
        if file_size > settings.max_upload_bytes:
            safe_unlink(downloaded_path)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Arquivo excede o limite de {settings.max_upload_mb} MB",
            )

        try:
            file_type = detect_media_type(downloaded_path.name)
        except ValueError as exc:
            safe_unlink(downloaded_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A URL nao retornou um audio ou video compativel com o pipeline",
            ) from exc

        extension = downloaded_path.suffix.lower()
        title = ""
        if isinstance(info, dict):
            title = str(info.get("title") or "").strip()
        original_filename = f"{_sanitize_title(title, f'{source}-media')}{extension}"
        mime_type = mimetypes.guess_type(downloaded_path.name)[0] or "application/octet-stream"

        upload = Upload(
            workspace_id=workspace_id,
            original_filename=original_filename,
            stored_filename=downloaded_path.name,
            file_type=file_type,
            mime_type=mime_type,
            original_path=str(downloaded_path),
            upload_size_bytes=file_size,
        )
        repository = UploadRepository(db)
        return repository.create(upload)
    except HTTPException:
        _cleanup_remote_downloads(download_prefix)
        raise
    except Exception as exc:
        _cleanup_remote_downloads(download_prefix)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=_remote_download_error_message(source, exc),
        ) from exc


def get_upload_or_404(db: Session, upload_id: str, workspace_id: str | None = None) -> Upload:
    repository = UploadRepository(db)
    upload = repository.get_for_workspace(upload_id, workspace_id) if workspace_id else repository.get(upload_id)
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    return upload


def list_uploads(db: Session, workspace_id: str = "local-workspace") -> list[Upload]:
    return UploadRepository(db).list(workspace_id)


def delete_upload(db: Session, upload_id: str, workspace_id: str = "local-workspace") -> None:
    repository = UploadRepository(db)
    upload = get_upload_or_404(db, upload_id, workspace_id)
    safe_unlink(upload.original_path)
    safe_unlink(upload.converted_path)
    repository.delete(upload)


def read_dashboard_stats(db: Session, workspace_id: str = "local-workspace") -> UploadStatsResponse:
    repository = UploadRepository(db)
    stats = repository.stats(workspace_id)
    recent_uploads = repository.list(workspace_id)[:5]
    return UploadStatsResponse(
        total_uploads=int(stats["total_uploads"] or 0),
        total_reports=int(stats["total_reports"] or 0),
        most_used_engine=stats["most_used_engine"],
        recent_uploads=recent_uploads,
    )
