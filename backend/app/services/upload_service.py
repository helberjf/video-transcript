import mimetypes
import os
import re
import shutil
from collections.abc import Callable
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


def _resolve_cookies_file() -> str | None:
    settings = get_settings()
    default_cookies_path = Path(settings.temp_dir) / "cookies.txt"
    if default_cookies_path.exists():
        return str(default_cookies_path)

    for env_var in ("INSTAGRAM_COOKIES_FILE", "YTDLP_COOKIES_FILE"):
        candidate = os.environ.get(env_var)
        if candidate and Path(candidate).exists():
            return candidate

    return None


# Nenhum player client funciona sempre: o mesmo video que hoje sai pelo "android"
# amanha so sai pelo "android_vr". A ordem comeca pelos que costumam entregar so a
# faixa de audio (download pequeno) e termina nos que entregam o progressivo inteiro,
# mas raramente falham. Nao remova um cliente so porque falhou em um video.
YOUTUBE_FALLBACK_PLAYER_CLIENTS: tuple[str, ...] = (
    "android_vr",
    "tv",
    "web_safari",
    "mweb",
    "ios",
    "tv_simply",
    "android",
)


def _with_youtube_player_client(ydl_options: dict[str, Any], player_client: str) -> dict[str, Any]:
    extractor_args = dict(ydl_options.get("extractor_args") or {})
    youtube_args = dict(extractor_args.get("youtube") or {})
    youtube_args["player_client"] = [player_client]
    extractor_args["youtube"] = youtube_args
    return {**ydl_options, "nocheckcertificate": True, "extractor_args": extractor_args}


JS_RUNTIME_CANDIDATES: tuple[str, ...] = ("deno", "node", "bun", "quickjs")

WINDOWS_NODE_FALLBACK_PATHS: tuple[str, ...] = (
    r"C:\Program Files\nodejs\node.exe",
    r"C:\Program Files (x86)\nodejs\node.exe",
)


def _resolve_js_runtimes() -> dict[str, dict[str, Any]]:
    """O YouTube exige um runtime JS para assinar as URLs; sem ele o download volta HTTP 403."""
    runtimes: dict[str, dict[str, Any]] = {}

    configured = os.environ.get("YTDLP_JS_RUNTIME")
    if configured:
        name, _, configured_path = configured.partition(":")
        name = name.strip().lower()
        if name in JS_RUNTIME_CANDIDATES:
            runtimes[name] = {"path": configured_path.strip()} if configured_path.strip() else {}

    for name in JS_RUNTIME_CANDIDATES:
        if name in runtimes:
            continue
        binary = shutil.which(name)
        if binary:
            runtimes[name] = {"path": binary}
        else:
            runtimes[name] = {}

    if not runtimes.get("node", {}).get("path"):
        for candidate in WINDOWS_NODE_FALLBACK_PATHS:
            if Path(candidate).exists():
                runtimes["node"] = {"path": candidate}
                break

    return runtimes


def _build_ydl_options(source: RemoteMediaSource, output_template: str) -> dict[str, Any]:
    ydl_options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "outtmpl": output_template,
        "windowsfilenames": True,
        "js_runtimes": _resolve_js_runtimes(),
    }

    cookies_file = _resolve_cookies_file()

    if source == "youtube":
        # O pipeline so usa o audio (ffmpeg descarta o video), entao baixar apenas a
        # faixa de audio evita os streams de video que o YouTube costuma barrar com 403.
        ydl_options["format"] = "ba[ext=m4a]/ba/b[ext=mp4]/b"
        ydl_options["merge_output_format"] = "mp4"

        # O arquivo de cookies e a saida documentada quando o YouTube passa a pedir
        # "confirme que voce nao e um robo". Ler cookies direto do navegador fica de
        # fora: no Windows o Chrome/Edge bloqueiam por DPAPI e quebram o download.
        if cookies_file:
            ydl_options["cookiefile"] = cookies_file
    else:
        ydl_options["format"] = "best[ext=mp4]/best"

        cookies_from_browser = (
            os.environ.get("INSTAGRAM_COOKIES_FROM_BROWSER")
            or os.environ.get("YTDLP_COOKIES_FROM_BROWSER")
        )
        if cookies_file:
            ydl_options["cookiefile"] = cookies_file
        elif cookies_from_browser:
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
    lower_message = compact_message.lower()

    # O "formato nao disponivel" quase sempre e consequencia do bloqueio anonimo:
    # sem passar na verificacao, o YouTube nao devolve nenhuma faixa de audio.
    if "requested format is not available" in lower_message and source == "youtube":
        return (
            "O YouTube nao liberou nenhuma faixa de audio para acesso anonimo. "
            "Costuma ser bloqueio temporario por excesso de downloads deste IP: espere alguns minutos. "
            "Se persistir, envie o cookies.txt em Ajustes > Cookies para baixar com a sua sessao."
        )

    if "requested format is not available" in lower_message:
        return f"{source_label} nao disponibilizou um formato compativel para download. Atualize o yt-dlp ou tente outro link."

    if "http error 403" in lower_message or "unable to download video data" in lower_message:
        if source == "youtube":
            return (
                "O YouTube recusou a entrega do video (HTTP 403) em todos os clientes anonimos testados. "
                "Atualize o yt-dlp (pip install -U yt-dlp), tente novamente em alguns minutos ou envie o arquivo local."
            )
        return (
            f"{source_label} recusou a entrega da midia (HTTP 403). "
            "Atualize o yt-dlp, revise os cookies em Configuracoes e tente novamente."
        )

    if "drm protected" in lower_message:
        return (
            f"{source_label} entregou apenas faixas protegidas por DRM para este link. "
            "Tente novamente em alguns minutos ou envie o audio/video como arquivo local."
        )

    if "http error 429" in lower_message or "too many requests" in lower_message:
        return (
            f"{source_label} limitou as requisicoes deste IP (HTTP 429). "
            "Aguarde alguns minutos antes de tentar o proximo download."
        )

    browser_cookie_failures = (
        "could not copy chrome cookie database",
        "could not find firefox cookies database",
        "failed to decrypt with dpapi",
    )
    if any(fragment in lower_message for fragment in browser_cookie_failures):
        return (
            f"O yt-dlp tentou ler cookies do navegador e falhou (Chrome/Edge bloqueiam por DPAPI no Windows). "
            "Va em Configuracoes > Cookies do Instagram, faca upload do cookies.txt e tente novamente."
        )

    needs_login_fragments = (
        "sign in",
        "login required",
        "rate-limit reached",
        "cookies",
        "private video",
        "confirm your age",
        "requested content is not available",
    )
    if any(fragment in lower_message for fragment in needs_login_fragments):
        if source == "youtube":
            return (
                "O YouTube bloqueou o download anonimo (pediu para confirmar que nao e um robo). "
                "Isso costuma acontecer depois de varios downloads seguidos do mesmo IP: espere alguns minutos e tente de novo. "
                "Para nao depender disso, envie o cookies.txt em Ajustes > Cookies e o download passa a usar a sua sessao."
            )
        return (
            f"{source_label} exige sessao logada para acessar essa midia. "
            "Va em Configuracoes > Cookies do Instagram, faca upload do cookies.txt exportado do navegador e tente novamente."
        )

    if "video unavailable" in lower_message:
        return f"{source_label} informou que o video esta indisponivel para este link."

    if compact_message:
        return f"Falha ao baixar a midia de {source_label}: {compact_message[:500]}"

    return f"Falha ao baixar a midia de {source_label}"


def _is_ssl_certificate_error(error: Exception) -> bool:
    lower_message = str(error).lower()
    return (
        "certificate_verify_failed" in lower_message
        or "certificate verify failed" in lower_message
        or "unable to get local issuer certificate" in lower_message
    )


YOUTUBE_RETRYABLE_ERROR_FRAGMENTS: tuple[str, ...] = (
    "sign in to confirm",
    "not a bot",
    "use --cookies-from-browser",
    "requested format is not available",
    "http error 403",
    "http error 429",
    "unable to download video data",
    "unable to download webpage",
    "failed to extract any player response",
    "drm protected",
    "only images are available",
)


def _is_youtube_retryable_error(error: Exception) -> bool:
    """Erros em que outro player client do YouTube costuma resolver o download."""
    lower_message = str(error).lower()
    return any(fragment in lower_message for fragment in YOUTUBE_RETRYABLE_ERROR_FRAGMENTS)


def extract_remote_info_with_ssl_fallback(
    source: RemoteMediaSource,
    url: str,
    ydl_options: dict[str, Any],
    *,
    download: bool,
    before_retry: Callable[[], None] | None = None,
) -> dict[str, Any] | None:
    try:
        import yt_dlp
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="yt-dlp nao esta instalado no backend",
        ) from exc

    def _attempt(options: dict[str, Any], *, first: bool = False) -> dict[str, Any] | None:
        if not first and before_retry is not None:
            before_retry()
        with yt_dlp.YoutubeDL(options) as downloader:
            return downloader.extract_info(url, download=download)

    try:
        return _attempt(ydl_options, first=True)
    except Exception as exc:
        last_error = exc
        if _is_ssl_certificate_error(exc) and not ydl_options.get("nocheckcertificate"):
            try:
                return _attempt({**ydl_options, "nocheckcertificate": True})
            except Exception as retry_exc:
                last_error = retry_exc

        if source == "youtube" and _is_youtube_retryable_error(last_error):
            for player_client in YOUTUBE_FALLBACK_PLAYER_CLIENTS:
                try:
                    return _attempt(_with_youtube_player_client(ydl_options, player_client))
                except Exception as client_exc:
                    if not _is_youtube_retryable_error(client_exc):
                        raise client_exc from last_error
                    last_error = client_exc

        raise last_error from exc


def create_upload_from_remote_url(db: Session, source: RemoteMediaSource, url: str, workspace_id: str = "local-workspace") -> Upload:
    settings = get_settings()
    normalized_url = _validate_remote_media_url(source, url)
    download_prefix = f"remote-{os.urandom(4).hex()}"
    output_template = str(settings.uploads_dir / f"{download_prefix}.%(ext)s")

    info: dict[str, Any] | None = None
    try:
        info = extract_remote_info_with_ssl_fallback(
            source,
            normalized_url,
            _build_ydl_options(source, output_template),
            download=True,
            before_retry=lambda: _cleanup_remote_downloads(download_prefix),
        )

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
            source_type=source,
            source_url=normalized_url,
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
