from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import call_with_workspace, get_workspace_id
from app.repositories.report_repository import ReportRepository
from app.schemas.report import GenerateReportRequest, ReportExportExtension, ReportExportRead, ReportRead, ReportRenameRequest
from app.services.report_service import generate_report, get_report_export, list_report_exports, rename_report


router = APIRouter(prefix="/api", tags=["reports"])


@router.post("/reports/generate", response_model=ReportRead)
def generate_report_endpoint(
    payload: GenerateReportRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportRead:
    try:
        return call_with_workspace(generate_report, db, payload, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/reports/{report_id}/exports", response_model=list[ReportExportRead])
def list_report_exports_endpoint(
    report_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> list[ReportExportRead]:
    try:
        export_files = call_with_workspace(list_report_exports, db, report_id, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return [
        ReportExportRead(
            extension=export_file.extension,
            filename=export_file.filename,
            media_type=export_file.media_type,
            size_bytes=export_file.path.stat().st_size,
            download_url=f"/api/reports/{report_id}/exports/{export_file.extension.value}",
        )
        for export_file in export_files
    ]


@router.get("/reports/{report_id}/exports/{extension}")
def download_report_export_endpoint(
    report_id: str,
    extension: ReportExportExtension,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> FileResponse:
    try:
        export_file = call_with_workspace(get_report_export, db, report_id, extension, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return FileResponse(
        path=export_file.path,
        media_type=export_file.media_type,
        filename=export_file.filename,
    )


@router.get("/reports/{report_id}", response_model=ReportRead)
def get_report_endpoint(
    report_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportRead:
    repository = ReportRepository(db)
    if hasattr(repository, "get_for_workspace"):
        report = repository.get_for_workspace(report_id, workspace_id)
    else:
        report = repository.get(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relatório não encontrado")
    return report


@router.patch("/reports/{report_id}", response_model=ReportRead)
def rename_report_endpoint(
    report_id: str,
    payload: ReportRenameRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> ReportRead:
    try:
        return call_with_workspace(rename_report, db, report_id, payload.title, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/uploads/{upload_id}/reports", response_model=list[ReportRead])
def list_upload_reports(
    upload_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> list[ReportRead]:
    repository = ReportRepository(db)
    if hasattr(repository, "list_by_upload_for_workspace"):
        return repository.list_by_upload_for_workspace(upload_id, workspace_id)
    return repository.list_by_upload(upload_id)
