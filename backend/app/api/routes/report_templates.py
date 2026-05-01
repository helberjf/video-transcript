from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import call_with_workspace, get_workspace_id
from app.schemas.report_template import (
    ReportTemplateCreate,
    ReportTemplateRead,
    ReportTemplateReferenceAnalysis,
    ReportTemplateReferenceText,
    ReportTemplateUpdate,
)
from app.services.report_template_service import (
    analyze_template_reference,
    create_template,
    create_template_from_reference,
    delete_template,
    duplicate_template,
    extract_template_reference_text,
    get_template,
    list_templates,
    update_template,
)
from app.services.usage_service import consume_credits


router = APIRouter(prefix="/api", tags=["report-templates"])


@router.get("/report-templates", response_model=list[ReportTemplateRead])
def list_templates_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> list[ReportTemplateRead]:
    return call_with_workspace(list_templates, db, workspace_id=workspace_id)


@router.post("/report-templates/analyze-reference-preview", response_model=ReportTemplateReferenceAnalysis)
def analyze_template_reference_endpoint(
    file: UploadFile = File(...),
    name: str | None = Form(None),
    description: str | None = Form(None),
    category: str | None = Form(None),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportTemplateReferenceAnalysis:
    try:
        consume_credits(db, workspace_id, "template_reference_analysis", 1, metadata={"filename": file.filename})
        return analyze_template_reference(
            db,
            file,
            name=name.strip() if isinstance(name, str) and name.strip() else None,
            description=description.strip() if isinstance(description, str) and description.strip() else None,
            category=category.strip() if isinstance(category, str) and category.strip() else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/report-templates/extract-reference-text", response_model=ReportTemplateReferenceText)
def extract_template_reference_text_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportTemplateReferenceText:
    try:
        consume_credits(db, workspace_id, "template_reference_extract", 1, metadata={"filename": file.filename})
        return extract_template_reference_text(file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/report-templates/analyze-reference", response_model=ReportTemplateRead)
def create_template_from_reference_endpoint(
    file: UploadFile = File(...),
    name: str | None = Form(None),
    description: str | None = Form(None),
    category: str | None = Form(None),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportTemplateRead:
    try:
        consume_credits(db, workspace_id, "template_reference_create", 1, metadata={"filename": file.filename})
        return call_with_workspace(
            create_template_from_reference,
            db,
            file,
            workspace_id=workspace_id,
            name=name.strip() if isinstance(name, str) and name.strip() else None,
            description=description.strip() if isinstance(description, str) and description.strip() else None,
            category=category.strip() if isinstance(category, str) and category.strip() else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/report-templates/{template_id}", response_model=ReportTemplateRead)
def get_template_endpoint(
    template_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportTemplateRead:
    try:
        return call_with_workspace(get_template, db, template_id, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/report-templates", response_model=ReportTemplateRead)
def create_template_endpoint(
    payload: ReportTemplateCreate,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportTemplateRead:
    try:
        return call_with_workspace(create_template, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/report-templates/{template_id}", response_model=ReportTemplateRead)
def update_template_endpoint(
    template_id: str,
    payload: ReportTemplateUpdate,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportTemplateRead:
    try:
        return call_with_workspace(update_template, db, template_id, payload, workspace_id=workspace_id)
    except ValueError as exc:
        status_code = status.HTTP_400_BAD_REQUEST if "Já existe" in str(exc) else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.delete("/report-templates/{template_id}")
def delete_template_endpoint(
    template_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, bool]:
    try:
        call_with_workspace(delete_template, db, template_id, workspace_id=workspace_id)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/report-templates/{template_id}/duplicate", response_model=ReportTemplateRead)
def duplicate_template_endpoint(
    template_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportTemplateRead:
    try:
        return call_with_workspace(duplicate_template, db, template_id, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
