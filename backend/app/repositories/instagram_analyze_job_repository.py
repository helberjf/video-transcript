from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.instagram_analyze_job import InstagramAnalyzeJob


class InstagramAnalyzeJobRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, job: InstagramAnalyzeJob) -> InstagramAnalyzeJob:
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def save(self, job: InstagramAnalyzeJob) -> InstagramAnalyzeJob:
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def get(self, job_id: str) -> InstagramAnalyzeJob | None:
        return self.db.get(InstagramAnalyzeJob, job_id)

    def get_for_workspace(self, job_id: str, workspace_id: str) -> InstagramAnalyzeJob | None:
        return self.db.scalar(
            select(InstagramAnalyzeJob).where(
                InstagramAnalyzeJob.id == job_id,
                InstagramAnalyzeJob.workspace_id == workspace_id,
            )
        )
