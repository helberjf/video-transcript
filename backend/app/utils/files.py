import mimetypes
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings
from app.models.enums import FileType


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}


def detect_media_type(filename: str) -> FileType:
    extension = Path(filename).suffix.lower()
    if extension in VIDEO_EXTENSIONS:
        return FileType.VIDEO
    if extension in AUDIO_EXTENSIONS:
        return FileType.AUDIO
    raise ValueError("Formato de arquivo não suportado")


def validate_upload(upload_file: UploadFile) -> FileType:
    settings = get_settings()
    content_type = upload_file.content_type or mimetypes.guess_type(upload_file.filename or "")[0] or "application/octet-stream"
    extension = Path(upload_file.filename or "").suffix.lower()
    file_type = FileType.AUDIO if extension == ".webm" and content_type.startswith("audio/") else detect_media_type(upload_file.filename or "")
    if file_type == FileType.VIDEO and not content_type.startswith("video/"):
        raise ValueError("O MIME type do vídeo é inválido")
    if file_type == FileType.AUDIO and not content_type.startswith("audio/"):
        raise ValueError("O MIME type do áudio é inválido")
    if settings.max_upload_bytes <= 0:
        raise ValueError("Configuração de upload inválida")
    return file_type


def save_upload_file(upload_file: UploadFile) -> tuple[Path, str, str]:
    settings = get_settings()
    suffix = Path(upload_file.filename or "upload.bin").suffix.lower()
    stored_filename = f"{uuid4()}{suffix}"
    destination = settings.uploads_dir / stored_filename
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    mime_type = upload_file.content_type or mimetypes.guess_type(upload_file.filename or "")[0] or "application/octet-stream"
    return destination, stored_filename, mime_type


def safe_unlink(path: str | Path | None) -> None:
    if not path:
        return
    target = Path(path)
    if target.exists():
        target.unlink()
