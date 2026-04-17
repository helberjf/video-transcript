from sqlalchemy.orm import Session

from app.models.report_template import ReportTemplate
from app.repositories.report_template_repository import ReportTemplateRepository
from app.schemas.report_template import ReportTemplateCreate, ReportTemplateUpdate


def list_templates(db: Session) -> list[ReportTemplate]:
    return ReportTemplateRepository(db).list()


def create_template(db: Session, payload: ReportTemplateCreate) -> ReportTemplate:
    repository = ReportTemplateRepository(db)
    if repository.get_by_name(payload.name):
        raise ValueError("Já existe um modelo com esse nome")
    return repository.create(ReportTemplate(**payload.model_dump()))


def update_template(db: Session, template_id: str, payload: ReportTemplateUpdate) -> ReportTemplate:
    repository = ReportTemplateRepository(db)
    template = repository.get(template_id)
    if not template:
        raise ValueError("Modelo não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    return repository.save(template)


def delete_template(db: Session, template_id: str) -> None:
    repository = ReportTemplateRepository(db)
    template = repository.get(template_id)
    if not template:
        raise ValueError("Modelo não encontrado")
    repository.delete(template)


def duplicate_template(db: Session, template_id: str) -> ReportTemplate:
    repository = ReportTemplateRepository(db)
    template = repository.get(template_id)
    if not template:
        raise ValueError("Modelo não encontrado")
    duplicate = ReportTemplate(
        name=f"{template.name} (cópia)",
        description=template.description,
        category=template.category,
        base_prompt=template.base_prompt,
        complementary_instructions=template.complementary_instructions,
        output_format=template.output_format,
        is_favorite=False,
    )
    return repository.create(duplicate)
