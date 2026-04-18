from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.report_repository import ReportRepository
from app.schemas.report import GenerateReportRequest, ReportRead, ReportRenameRequest
from app.services.report_service import generate_report, rename_report


router = APIRouter(prefix="/api", tags=["reports"])


@router.post("/reports/generate", response_model=ReportRead)
def generate_report_endpoint(payload: GenerateReportRequest, db: Session = Depends(get_db)) -> ReportRead:
    try:
        return generate_report(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/reports/{report_id}", response_model=ReportRead)
def get_report_endpoint(report_id: str, db: Session = Depends(get_db)) -> ReportRead:
    report = ReportRepository(db).get(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relatório não encontrado")
    return report


@router.patch("/reports/{report_id}", response_model=ReportRead)
def rename_report_endpoint(report_id: str, payload: ReportRenameRequest, db: Session = Depends(get_db)) -> ReportRead:
    try:
        return rename_report(db, report_id, payload.title)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/uploads/{upload_id}/reports", response_model=list[ReportRead])
def list_upload_reports(upload_id: str, db: Session = Depends(get_db)) -> list[ReportRead]:
    return ReportRepository(db).list_by_upload(upload_id)
