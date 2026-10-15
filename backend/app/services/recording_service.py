"""Sessao de gravacao de reuniao: pedacos de audio enviados durante a chamada e capturas de tela."""

import io
import json
import re

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import file_store
from app.models.enums import CaptureTrigger, FileType, ProcessingStatus
from app.models.meeting_capture import MeetingCapture
from app.models.upload import Upload
from app.repositories.upload_repository import UploadRepository


MEETING_SOURCE_TYPE = "meeting"
RECORDING_FILENAME = "recording.webm"
MAX_CHUNK_BYTES = 20 * 1024 * 1024
MAX_CAPTURE_BYTES = 15 * 1024 * 1024
ALLOWED_CAPTURE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


def recording_prefix(upload_id: str) -> str:
    return f"recordings/{upload_id}/"


def recording_key(upload_id: str) -> str:
    return f"{recording_prefix(upload_id)}{RECORDING_FILENAME}"


def _chunks_prefix(upload_id: str) -> str:
    return f"{recording_prefix(upload_id)}chunks/"


def _sanitize_title(value: str | None) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]+', " ", value or "").strip()
    return re.sub(r"\s+", " ", cleaned)[:140] or "Reuniao gravada"


def get_meeting_or_404(db: Session, upload_id: str, workspace_id: str) -> Upload:
    upload = UploadRepository(db).get_for_workspace(upload_id, workspace_id)
    if not upload or upload.source_type != MEETING_SOURCE_TYPE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gravacao nao encontrada")
    return upload


def _require_recording(upload: Upload) -> None:
    if upload.status != ProcessingStatus.RECORDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta gravacao ja foi finalizada")


def read_meta(upload: Upload) -> dict:
    try:
        return json.loads(upload.recording_meta or "{}")
    except ValueError:
        return {}


def write_meta(upload: Upload, **values) -> None:
    meta = read_meta(upload)
    meta.update(values)
    upload.recording_meta = json.dumps(meta, ensure_ascii=False)


def start_recording(
    db: Session,
    title: str | None,
    language: str | None,
    capture_screens: bool,
    workspace_id: str,
) -> Upload:
    upload = Upload(
        workspace_id=workspace_id,
        original_filename=f"{_sanitize_title(title)}.webm",
        stored_filename=RECORDING_FILENAME,
        file_type=FileType.AUDIO,
        mime_type="audio/webm",
        original_path="",
        source_type=MEETING_SOURCE_TYPE,
        upload_size_bytes=0,
        status=ProcessingStatus.RECORDING,
    )
    repository = UploadRepository(db)
    upload = repository.create(upload)
    upload.original_path = recording_key(upload.id)
    write_meta(upload, language=language, capture_screens=capture_screens)
    return repository.save(upload)


def save_chunk(db: Session, upload_id: str, sequence: int, data: bytes, workspace_id: str) -> int:
    upload = get_meeting_or_404(db, upload_id, workspace_id)
    _require_recording(upload)
    if sequence < 0 or sequence > 999_999:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sequencia invalida")
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pedaco vazio")
    if len(data) > MAX_CHUNK_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Pedaco grande demais")

    # Reenviar o mesmo numero sobrescreve: o cliente repete o envio quando a rede falha.
    file_store.put(f"{_chunks_prefix(upload.id)}{sequence:06d}.webm", data, db)
    return sequence


def _image_size_and_hash(data: bytes) -> tuple[int | None, int | None, str | None]:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            return width, height, difference_hash(image)
    except Exception:
        return None, None, None


def difference_hash(image) -> str:
    """dHash de 64 bits: capturas quase iguais (mesmo slide) ficam a poucos bits de distancia."""
    small = image.convert("L").resize((9, 8))
    pixels = list(small.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return f"{bits:016x}"


def hamming_distance(first: str, second: str) -> int:
    return bin(int(first, 16) ^ int(second, 16)).count("1")


def save_capture(
    db: Session,
    upload_id: str,
    image: UploadFile,
    offset_seconds: float,
    trigger: CaptureTrigger,
    workspace_id: str,
) -> MeetingCapture:
    upload = get_meeting_or_404(db, upload_id, workspace_id)
    mime_type = (image.content_type or "").split(";")[0].strip().lower()
    extension = ALLOWED_CAPTURE_TYPES.get(mime_type)
    if not extension:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A captura precisa ser PNG, JPEG ou WebP")

    data = image.file.read(MAX_CAPTURE_BYTES + 1)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Captura vazia")
    if len(data) > MAX_CAPTURE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Captura grande demais")

    width, height, dhash = _image_size_and_hash(data)
    capture = MeetingCapture(
        workspace_id=workspace_id,
        upload_id=upload.id,
        stored_path="",
        mime_type=mime_type,
        offset_seconds=max(0.0, float(offset_seconds)),
        trigger=trigger,
        width=width,
        height=height,
        dhash=dhash,
    )
    db.add(capture)
    db.flush()
    capture.stored_path = f"{recording_prefix(upload.id)}captures/{capture.id}{extension}"
    file_store.put(capture.stored_path, data, db)
    db.commit()
    db.refresh(capture)
    return capture


def list_captures(db: Session, upload_id: str, workspace_id: str) -> list[MeetingCapture]:
    upload = UploadRepository(db).get_for_workspace(upload_id, workspace_id)
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo nao encontrado")
    return list(upload.captures)


def get_capture_or_404(db: Session, capture_id: str, workspace_id: str) -> MeetingCapture:
    capture = db.scalar(
        select(MeetingCapture).where(MeetingCapture.id == capture_id, MeetingCapture.workspace_id == workspace_id)
    )
    if not capture:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Captura nao encontrada")
    return capture


def update_capture(db: Session, capture_id: str, included: bool, workspace_id: str) -> MeetingCapture:
    capture = get_capture_or_404(db, capture_id, workspace_id)
    capture.included = included
    db.commit()
    db.refresh(capture)
    return capture


def delete_capture(db: Session, capture_id: str, workspace_id: str) -> None:
    capture = get_capture_or_404(db, capture_id, workspace_id)
    file_store.delete_key(capture.stored_path, db)
    db.delete(capture)
    db.commit()


def assemble_recording(db: Session, upload: Upload) -> int:
    """Junta os pedacos na ordem. Pedacos do mesmo MediaRecorder formam um webm continuo."""
    key = recording_key(upload.id)
    chunk_keys = file_store.list_keys(_chunks_prefix(upload.id), db)
    if not chunk_keys:
        existing = file_store.get(key, db)
        if existing:
            return len(existing)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum audio foi recebido nesta gravacao")

    data = b"".join(file_store.get(chunk_key, db) or b"" for chunk_key in chunk_keys)
    file_store.put(key, data, db)
    file_store.delete_prefix(_chunks_prefix(upload.id), db)
    return len(data)


def finish_recording(
    db: Session,
    upload_id: str,
    analysis_mode: str,
    duration_seconds: float | None,
    energy: list[list[float]] | None,
    markers: list[dict] | None,
    has_system_audio: bool | None,
    workspace_id: str,
) -> Upload:
    upload = get_meeting_or_404(db, upload_id, workspace_id)
    _require_recording(upload)
    upload.original_path = recording_key(upload.id)
    upload.upload_size_bytes = assemble_recording(db, upload)
    upload.duration_seconds = duration_seconds
    upload.analysis_mode = analysis_mode
    upload.status = ProcessingStatus.UPLOADED
    write_meta(
        upload,
        markers=markers or [],
        has_system_audio=has_system_audio,
        client_duration_seconds=duration_seconds,
    )
    file_store.put(f"{recording_prefix(upload.id)}energy.json", json.dumps(energy or []).encode("utf-8"), db)
    return UploadRepository(db).save(upload)


def list_interrupted(db: Session, workspace_id: str) -> list[Upload]:
    statement = select(Upload).where(
        Upload.workspace_id == workspace_id,
        Upload.source_type == MEETING_SOURCE_TYPE,
        Upload.status == ProcessingStatus.RECORDING,
    )
    return list(db.scalars(statement.order_by(Upload.created_at.desc())).all())


def read_energy(upload_id: str, db: Session | None = None) -> list[list[float]]:
    try:
        data = json.loads((file_store.get(f"{recording_prefix(upload_id)}energy.json", db) or b"[]").decode("utf-8"))
    except ValueError:
        return []
    return [row for row in data if isinstance(row, list) and len(row) >= 3]


def delete_recording_files(upload_id: str, db: Session | None = None) -> None:
    file_store.delete_prefix(recording_prefix(upload_id), db)
