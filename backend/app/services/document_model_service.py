import mimetypes
import re
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.document_model import DocumentModel
from app.repositories.document_model_repository import DocumentModelRepository
from app.schemas.document_model import DocumentModelCreate, DocumentModelUpdate
from app.services.report_template_service import _extract_reference_text, _read_reference_file


MAX_DOCUMENT_MODEL_BYTES = 15 * 1024 * 1024
DEFAULT_BASE_INSTRUCTIONS = (
    "Use o documento como base estrutural e de conteúdo para gerar relatórios a partir da transcrição. "
    "Preserve títulos, seções, ordem e terminologia sempre que fizer sentido."
)


def _normalize_text(value: str | None, fallback: str = "") -> str:
    if value is None:
        return fallback
    normalized = value.strip()
    return normalized or fallback


def _safe_filename(filename: str | None) -> str:
    raw_name = Path(filename or "documento").name.strip() or "documento"
    return re.sub(r'[\\/:*?"<>|]+', "-", raw_name)


def _document_model_dir(document_model_id: str) -> Path:
    return get_settings().storage_dir / "document_models" / document_model_id


def list_document_models(db: Session, workspace_id: str = "local-workspace") -> list[DocumentModel]:
    return DocumentModelRepository(db).list(workspace_id)


def get_document_model(db: Session, document_model_id: str, workspace_id: str = "local-workspace") -> DocumentModel:
    document_model = DocumentModelRepository(db).get_for_workspace(document_model_id, workspace_id)
    if not document_model:
        raise ValueError("Modelo de documento não encontrado")
    return document_model


def create_document_model(
    db: Session,
    reference_file: UploadFile,
    *,
    name: str,
    description: str,
    category: str | None,
    default_context: str,
    workspace_id: str = "local-workspace",
    base_instructions: str | None = None,
) -> DocumentModel:
    repository = DocumentModelRepository(db)
    normalized_name = _normalize_text(name)
    if repository.get_by_name(normalized_name, workspace_id):
        raise ValueError("Já existe um modelo de documento com esse nome")

    data = _read_reference_file(reference_file)
    if len(data) > MAX_DOCUMENT_MODEL_BYTES:
        raise ValueError("Arquivo de referencia excede o limite de 15 MB")

    source_filename = _safe_filename(reference_file.filename)
    source_mime_type = reference_file.content_type or mimetypes.guess_type(source_filename)[0] or "application/octet-stream"
    source_text = _extract_reference_text(source_filename, source_mime_type, data)
    if not source_text:
        raise ValueError("Nao foi possivel extrair texto do documento")

    document_model = DocumentModel(
        id=str(uuid4()),
        workspace_id=workspace_id,
        name=normalized_name,
        description=_normalize_text(description),
        category=_normalize_text(category, "Documento") if category is None else _normalize_text(category),
        source_filename=source_filename,
        source_mime_type=source_mime_type,
        source_path=str(_document_model_dir("pending") / source_filename),
        source_text=source_text,
        base_instructions=_normalize_text(base_instructions, DEFAULT_BASE_INSTRUCTIONS),
        default_context=_normalize_text(default_context),
    )

    storage_dir = _document_model_dir(document_model.id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    source_path = storage_dir / source_filename
    source_path.write_bytes(data)
    document_model.source_path = str(source_path)

    return repository.save(document_model)


def update_document_model(
    db: Session,
    document_model_id: str,
    payload: DocumentModelUpdate,
    workspace_id: str = "local-workspace",
) -> DocumentModel:
    repository = DocumentModelRepository(db)
    document_model = repository.get_for_workspace(document_model_id, workspace_id)
    if not document_model:
        raise ValueError("Modelo de documento não encontrado")

    next_name = _normalize_text(payload.name, document_model.name) if payload.name is not None else document_model.name
    if next_name != document_model.name and repository.get_by_name(next_name, workspace_id):
        raise ValueError("Já existe um modelo de documento com esse nome")

    if payload.name is not None:
        document_model.name = next_name
    if payload.description is not None:
        document_model.description = _normalize_text(payload.description, document_model.description)
    if payload.category is not None:
        document_model.category = _normalize_text(payload.category, document_model.category)
    if payload.base_instructions is not None:
        document_model.base_instructions = _normalize_text(payload.base_instructions, document_model.base_instructions)
    if payload.default_context is not None:
        document_model.default_context = _normalize_text(payload.default_context, document_model.default_context)

    return repository.save(document_model)


def delete_document_model(db: Session, document_model_id: str, workspace_id: str = "local-workspace") -> None:
    repository = DocumentModelRepository(db)
    document_model = repository.get_for_workspace(document_model_id, workspace_id)
    if not document_model:
        raise ValueError("Modelo de documento não encontrado")
    repository.delete(document_model)
