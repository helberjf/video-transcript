from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import call_with_workspace, get_workspace_id
from app.schemas.document_model import DocumentModelCreate, DocumentModelRead, DocumentModelUpdate
from app.services.document_model_service import (
    create_document_model,
    delete_document_model,
    get_document_model,
    list_document_models,
    update_document_model,
)


router = APIRouter(prefix="/api", tags=["document-models"])


@router.get("/document-models", response_model=list[DocumentModelRead])
def list_document_models_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> list[DocumentModelRead]:
    return call_with_workspace(list_document_models, db, workspace_id=workspace_id)


@router.get("/document-models/{document_model_id}", response_model=DocumentModelRead)
def get_document_model_endpoint(
    document_model_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> DocumentModelRead:
    try:
        return call_with_workspace(get_document_model, db, document_model_id, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/document-models", response_model=DocumentModelRead)
def create_document_model_endpoint(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(...),
    category: str | None = Form(None),
    default_context: str = Form(...),
    base_instructions: str | None = Form(None),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> DocumentModelRead:
    try:
        return call_with_workspace(
            create_document_model,
            db,
            file,
            workspace_id=workspace_id,
            name=name.strip(),
            description=description.strip(),
            category=category.strip() if isinstance(category, str) and category.strip() else None,
            default_context=default_context.strip(),
            base_instructions=base_instructions.strip() if isinstance(base_instructions, str) and base_instructions.strip() else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/document-models/{document_model_id}", response_model=DocumentModelRead)
def update_document_model_endpoint(
    document_model_id: str,
    payload: DocumentModelUpdate,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> DocumentModelRead:
    try:
        return call_with_workspace(update_document_model, db, document_model_id, payload, workspace_id=workspace_id)
    except ValueError as exc:
        status_code = status.HTTP_400_BAD_REQUEST if "Já existe" in str(exc) else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.delete("/document-models/{document_model_id}")
def delete_document_model_endpoint(
    document_model_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, bool]:
    try:
        call_with_workspace(delete_document_model, db, document_model_id, workspace_id=workspace_id)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
