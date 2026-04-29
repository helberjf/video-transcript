from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.report import GeneratedReport


class ReportRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, report: GeneratedReport) -> GeneratedReport:
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)
        return report

    def save(self, report: GeneratedReport) -> GeneratedReport:
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)
        return report

    def list_by_upload(self, upload_id: str) -> list[GeneratedReport]:
        return list(
            self.db.scalars(
                select(GeneratedReport)
                .where(GeneratedReport.upload_id == upload_id)
                .order_by(GeneratedReport.created_at.desc())
            ).all()
        )

    def list_by_upload_for_workspace(self, upload_id: str, workspace_id: str) -> list[GeneratedReport]:
        return list(
            self.db.scalars(
                select(GeneratedReport)
                .where(GeneratedReport.upload_id == upload_id, GeneratedReport.workspace_id == workspace_id)
                .order_by(GeneratedReport.created_at.desc())
            ).all()
        )

    def get(self, report_id: str) -> GeneratedReport | None:
        return self.db.get(GeneratedReport, report_id)

    def get_for_workspace(self, report_id: str, workspace_id: str) -> GeneratedReport | None:
        return self.db.scalar(select(GeneratedReport).where(GeneratedReport.id == report_id, GeneratedReport.workspace_id == workspace_id))
