from sqlalchemy.orm import Session

from app.models.enums import ReportFormat
from app.models.report_template import ReportTemplate
from app.repositories.report_template_repository import ReportTemplateRepository


DEFAULT_TEMPLATES = [
    {
        "name": "Resumo executivo",
        "description": "Resumo objetivo com pontos centrais, riscos e próximos passos.",
        "category": "executivo",
        "base_prompt": "Com base na transcrição, gere um resumo executivo curto com contexto, pontos principais, riscos e ações recomendadas.",
        "complementary_instructions": "Use linguagem clara e profissional.",
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": True,
    },
    {
        "name": "Ata de reunião",
        "description": "Organiza participantes, decisões, pendências e próximos passos.",
        "category": "reunião",
        "base_prompt": "Transforme a transcrição em uma ata de reunião estruturada com participantes, agenda, decisões, pendências e responsáveis.",
        "complementary_instructions": "Se algum dado não estiver claro, sinalize como não identificado.",
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": True,
    },
    {
        "name": "Perguntas e respostas",
        "description": "Extrai perguntas, respostas e temas recorrentes.",
        "category": "análise",
        "base_prompt": "Analise a transcrição e gere uma seção de perguntas e respostas, agrupando por tema e destacando itens inconclusivos.",
        "complementary_instructions": "Priorize objetividade.",
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": False,
    },
]


def seed_report_templates(db: Session) -> None:
    repository = ReportTemplateRepository(db)
    for template_data in DEFAULT_TEMPLATES:
        if repository.get_by_name(template_data["name"]):
            continue
        repository.create(ReportTemplate(**template_data))
