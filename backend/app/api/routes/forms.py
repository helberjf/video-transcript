import shutil

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.database import get_db
from app.core.workspace import call_with_workspace, get_workspace_id
from app.schemas.form import (
    FormDetectFieldsRequest,
    FormDetectFieldsResponse,
    FormExportRequest,
    FormFillFieldsRequest,
    FormFillRequest,
    FormFillResponse,
)
from app.services.form_service import build_form_export, detect_form_fields, fill_form_from_fields, fill_form_from_text
from app.services.usage_service import consume_credits


router = APIRouter(prefix="/api", tags=["forms"])


@router.post("/forms/fill", response_model=FormFillResponse)
def fill_form_endpoint(
    payload: FormFillRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FormFillResponse:
    try:
        consume_credits(db, workspace_id, "form_generation", 1, metadata={"template_id": payload.template_id})
        return call_with_workspace(fill_form_from_text, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/forms/fill-fields", response_model=FormFillResponse)
def fill_form_fields_endpoint(
    payload: FormFillFieldsRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FormFillResponse:
    try:
        consume_credits(db, workspace_id, "form_generation", 1, metadata={"template_id": payload.template_id})
        return call_with_workspace(fill_form_from_fields, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/forms/detect-fields", response_model=FormDetectFieldsResponse)
def detect_form_fields_endpoint(
    payload: FormDetectFieldsRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FormDetectFieldsResponse:
    try:
        return call_with_workspace(detect_form_fields, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


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
