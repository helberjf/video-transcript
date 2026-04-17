from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.report_template import ReportTemplate


class ReportTemplateRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[ReportTemplate]:
        return list(self.db.scalars(select(ReportTemplate).order_by(ReportTemplate.is_favorite.desc(), ReportTemplate.name.asc())).all())

    def get(self, template_id: str) -> ReportTemplate | None:
        return self.db.get(ReportTemplate, template_id)

    def get_by_name(self, name: str) -> ReportTemplate | None:
        return self.db.scalar(select(ReportTemplate).where(ReportTemplate.name == name))

    def create(self, template: ReportTemplate) -> ReportTemplate:
        self.db.add(template)
        self.db.commit()
        self.db.refresh(template)
        return template

    def save(self, template: ReportTemplate) -> ReportTemplate:
        self.db.add(template)
        self.db.commit()
        self.db.refresh(template)
        return template

    def delete(self, template: ReportTemplate) -> None:
        self.db.delete(template)
        self.db.commit()
