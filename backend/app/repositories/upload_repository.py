from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.report import GeneratedReport
from app.models.upload import Upload


class UploadRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, upload: Upload) -> Upload:
        self.db.add(upload)
        self.db.commit()
        self.db.refresh(upload)
        return upload

    def get(self, upload_id: str) -> Upload | None:
        return self.db.get(Upload, upload_id)

    def get_for_workspace(self, upload_id: str, workspace_id: str) -> Upload | None:
        return self.db.scalar(select(Upload).where(Upload.id == upload_id, Upload.workspace_id == workspace_id))

    def list(self, workspace_id: str | None = None) -> list[Upload]:
        statement = select(Upload)
        if workspace_id is not None:
            statement = statement.where(Upload.workspace_id == workspace_id)
        return list(self.db.scalars(statement.order_by(Upload.created_at.desc())).all())

    def delete(self, upload: Upload) -> None:
        self.db.delete(upload)
        self.db.commit()

    def save(self, upload: Upload) -> Upload:
        self.db.add(upload)
        self.db.commit()
        self.db.refresh(upload)
        return upload

    def stats(self, workspace_id: str | None = None) -> dict[str, int | str | None]:
        upload_count = select(func.count()).select_from(Upload)
        report_count = select(func.count()).select_from(GeneratedReport)
        engine_statement = select(Upload.transcription_engine, func.count()).group_by(Upload.transcription_engine)
        if workspace_id is not None:
            upload_count = upload_count.where(Upload.workspace_id == workspace_id)
            report_count = report_count.where(GeneratedReport.workspace_id == workspace_id)
            engine_statement = engine_statement.where(Upload.workspace_id == workspace_id)

        total_uploads = self.db.scalar(upload_count) or 0
        total_reports = self.db.scalar(report_count) or 0
        engine_row = self.db.execute(engine_statement.order_by(func.count().desc())).first()
        return {
            "total_uploads": total_uploads,
            "total_reports": total_reports,
            "most_used_engine": engine_row[0].value if engine_row else None,
        }
