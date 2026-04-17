from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.upload import Upload
from app.repositories.upload_repository import UploadRepository
from app.schemas.upload import UploadStatsResponse
from app.utils.files import safe_unlink, save_upload_file, validate_upload


def create_upload(db: Session, upload_file: UploadFile) -> Upload:
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
        original_filename=Path(upload_file.filename).name,
        stored_filename=stored_filename,
        file_type=file_type,
        mime_type=mime_type,
        original_path=str(saved_path),
        upload_size_bytes=file_size,
    )
    repository = UploadRepository(db)
    return repository.create(upload)


def get_upload_or_404(db: Session, upload_id: str) -> Upload:
    repository = UploadRepository(db)
    upload = repository.get(upload_id)
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    return upload


def list_uploads(db: Session) -> list[Upload]:
    return UploadRepository(db).list()


def delete_upload(db: Session, upload_id: str) -> None:
    repository = UploadRepository(db)
    upload = get_upload_or_404(db, upload_id)
    safe_unlink(upload.original_path)
    safe_unlink(upload.converted_path)
    repository.delete(upload)


def read_dashboard_stats(db: Session) -> UploadStatsResponse:
    repository = UploadRepository(db)
    stats = repository.stats()
    recent_uploads = repository.list()[:5]
    return UploadStatsResponse(
        total_uploads=int(stats["total_uploads"] or 0),
        total_reports=int(stats["total_reports"] or 0),
        most_used_engine=stats["most_used_engine"],
        recent_uploads=recent_uploads,
    )
