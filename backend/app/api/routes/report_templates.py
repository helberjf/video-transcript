from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.report_template import ReportTemplateCreate, ReportTemplateRead, ReportTemplateUpdate
from app.services.report_template_service import create_template, delete_template, duplicate_template, list_templates, update_template


router = APIRouter(prefix="/api", tags=["report-templates"])


@router.get("/report-templates", response_model=list[ReportTemplateRead])
def list_templates_endpoint(db: Session = Depends(get_db)) -> list[ReportTemplateRead]:
    return list_templates(db)


@router.post("/report-templates", response_model=ReportTemplateRead)
def create_template_endpoint(payload: ReportTemplateCreate, db: Session = Depends(get_db)) -> ReportTemplateRead:
    try:
        return create_template(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/report-templates/{template_id}", response_model=ReportTemplateRead)
def update_template_endpoint(template_id: str, payload: ReportTemplateUpdate, db: Session = Depends(get_db)) -> ReportTemplateRead:
    try:
        return update_template(db, template_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/report-templates/{template_id}")
def delete_template_endpoint(template_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    try:
        delete_template(db, template_id)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/report-templates/{template_id}/duplicate", response_model=ReportTemplateRead)
def duplicate_template_endpoint(template_id: str, db: Session = Depends(get_db)) -> ReportTemplateRead:
    try:
        return duplicate_template(db, template_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
