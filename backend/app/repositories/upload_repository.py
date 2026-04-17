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

    def list(self) -> list[Upload]:
        return list(self.db.scalars(select(Upload).order_by(Upload.created_at.desc())).all())

    def delete(self, upload: Upload) -> None:
        self.db.delete(upload)
        self.db.commit()

    def save(self, upload: Upload) -> Upload:
        self.db.add(upload)
        self.db.commit()
        self.db.refresh(upload)
        return upload

    def stats(self) -> dict[str, int | str | None]:
        total_uploads = self.db.scalar(select(func.count()).select_from(Upload)) or 0
        total_reports = self.db.scalar(select(func.count()).select_from(GeneratedReport)) or 0
        engine_row = self.db.execute(
            select(Upload.transcription_engine, func.count())
            .group_by(Upload.transcription_engine)
            .order_by(func.count().desc())
        ).first()
        return {
            "total_uploads": total_uploads,
            "total_reports": total_reports,
            "most_used_engine": engine_row[0].value if engine_row else None,
        }
