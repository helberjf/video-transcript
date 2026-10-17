import shutil

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.database import get_db
from app.core.rate_limit import rate_limit
from app.core.workspace import call_with_workspace, get_workspace_id
from app.schemas.form import (
    FormDetectFieldsRequest,
    FormDetectFieldsResponse,
    FormExportRequest,
    FormFillFieldsRequest,
    FormFillRequest,
    FormFillResponse,
    FormPaperReadResponse,
)
from app.services.form_service import build_form_export, detect_form_fields, fill_form_from_fields, fill_form_from_text
from app.services.paper_reading_service import read_paper_fields
from app.services.usage_service import charge
from app.services.vision_service import VisionUnavailableError


router = APIRouter(prefix="/api", tags=["forms"])


@router.post("/forms/fill", response_model=FormFillResponse, dependencies=[rate_limit("ai")])
def fill_form_endpoint(
    payload: FormFillRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FormFillResponse:
    try:
        with charge(db, workspace_id, "form_generation", metadata={"template_id": payload.template_id}):
            return call_with_workspace(fill_form_from_text, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/forms/fill-fields", response_model=FormFillResponse, dependencies=[rate_limit("ai")])
def fill_form_fields_endpoint(
    payload: FormFillFieldsRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FormFillResponse:
    try:
        with charge(db, workspace_id, "form_generation", metadata={"template_id": payload.template_id}):
            return call_with_workspace(fill_form_from_fields, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/forms/detect-fields", response_model=FormDetectFieldsResponse, dependencies=[rate_limit("ai")])
def detect_form_fields_endpoint(
    payload: FormDetectFieldsRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FormDetectFieldsResponse:
    try:
        with charge(db, workspace_id, "form_field_detection", metadata={"template_id": payload.template_id}):
            return call_with_workspace(detect_form_fields, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/forms/read-paper", response_model=FormPaperReadResponse, dependencies=[rate_limit("ai")])
def read_paper_endpoint(
    template_id: str = Form(...),
    files: list[UploadFile] = File(...),
    additional_instructions: str | None = Form(None),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FormPaperReadResponse:
    """Le fotos/scans do papel (inclusive manuscrito) e devolve os valores dos campos do modelo."""
    try:
        # 1 credito por foto/pagina enviada.
        with charge(
            db,
            workspace_id,
            "form_paper_reading",
            quantity=len(files),
            metadata={"template_id": template_id, "files": len(files)},
        ):
            return read_paper_fields(db, template_id, files, additional_instructions, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except VisionUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/forms/export")
def export_form_endpoint(payload: FormExportRequest, workspace_id: str = Depends(get_workspace_id)) -> FileResponse:
    try:
        artifact = build_form_export(payload.title, payload.content, payload.extension)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    def cleanup(temp_dir: str) -> None:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return FileResponse(
        path=artifact.path,
        media_type=artifact.media_type,
        filename=artifact.filename,
        background=BackgroundTask(cleanup, str(artifact.path.parent)),
    )
