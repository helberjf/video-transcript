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
        "example_output": "# Resumo executivo\n\n## Contexto\n- Situação geral\n\n## Pontos principais\n- Ponto 1\n- Ponto 2\n\n## Riscos\n- Risco 1\n\n## Próximos passos\n- Ação 1",
        "complementary_instructions": "Use linguagem clara e profissional.",
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": True,
    },
    {
        "name": "Ata de reunião",
        "description": "Organiza participantes, decisões, pendências e próximos passos.",
        "category": "reuniao",
        "base_prompt": "Transforme a transcrição em uma ata de reunião estruturada com participantes, agenda, decisões, pendências e responsáveis.",
        "example_output": "# Ata de reunião\n\n## Participantes\n- Nome / área\n\n## Agenda\n- Tema 1\n\n## Decisões\n- Decisão 1\n\n## Pendências e responsáveis\n- Pendência: responsável\n\n## Próximos passos\n- Passo 1",
        "complementary_instructions": "Se algum dado não estiver claro, sinalize como não identificado.",
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": True,
    },
    {
        "name": "Perguntas e respostas",
        "description": "Extrai perguntas, respostas e temas recorrentes.",
        "category": "analise",
        "base_prompt": "Analise a transcrição e gere uma seção de perguntas e respostas, agrupando por tema e destacando itens inconclusivos.",
        "example_output": "# Perguntas e respostas\n\n## Tema 1\n### Pergunta\nTexto da pergunta\n\n### Resposta\nTexto da resposta\n\n### Observações\nItens pendentes ou inconclusivos",
        "complementary_instructions": "Priorize objetividade.",
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": False,
    },
]


def seed_report_templates(db: Session) -> None:
    repository = ReportTemplateRepository(db)
    for template_data in DEFAULT_TEMPLATES:
        existing = repository.get_by_name(template_data["name"])
        if existing:
            if not existing.example_output and template_data.get("example_output"):
                existing.example_output = template_data["example_output"]
                repository.save(existing)
            continue
        repository.create(ReportTemplate(**template_data))
