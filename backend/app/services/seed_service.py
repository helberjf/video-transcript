from sqlalchemy.orm import Session

from app.models.enums import ReportFormat
from app.models.report_template import ReportTemplate
from app.repositories.report_template_repository import ReportTemplateRepository

DEFAULT_SEED_WORKSPACE_ID = "local-workspace"

DEFAULT_TEMPLATE_NAME = "Resumo objetivo"

DEFAULT_TEMPLATES = [
    {
        "name": DEFAULT_TEMPLATE_NAME,
        "description": "Resumo curto e direto do que foi dito, em tópicos.",
        "category": "resumo",
        "base_prompt": (
            "Resuma a transcrição de forma objetiva e direta. Comece com uma frase que diga do que se trata "
            "e siga com tópicos curtos cobrindo os pontos realmente relevantes. Sem enrolação, sem repetir "
            "a mesma ideia e sem inventar nada que não esteja na transcrição."
        ),
        "example_output": "# Resumo\n\nDo que se trata em uma frase.\n\n## Pontos principais\n- Ponto 1\n- Ponto 2\n- Ponto 3\n\n## Conclusão\n- O que fica decidido ou pendente",
        "complementary_instructions": "Prefira frases curtas. Se algo não estiver claro no áudio, escreva 'Não informado na transcrição'.",
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": True,
    },
    {
        "name": "Resumo executivo",
        "description": "Para decisão: contexto, pontos centrais, riscos e próximos passos.",
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


# Descricoes de seeds antigos que devem ser atualizadas. So substituimos quando o
# texto ainda e exatamente o antigo, para nunca sobrescrever edicao do usuario.
LEGACY_DESCRIPTIONS = {
    "Resumo executivo": "Resumo objetivo com pontos centrais, riscos e próximos passos.",
}


def seed_report_templates(db: Session) -> None:
    repository = ReportTemplateRepository(db)
    for template_data in DEFAULT_TEMPLATES:
        name = template_data["name"]
        existing = repository.get_by_name(name, DEFAULT_SEED_WORKSPACE_ID)
        if existing:
            changed = False
            if not existing.example_output and template_data.get("example_output"):
                existing.example_output = template_data["example_output"]
                changed = True
            if existing.description == LEGACY_DESCRIPTIONS.get(name):
                existing.description = template_data["description"]
                changed = True
            if changed:
                repository.save(existing)
            continue
        repository.create(ReportTemplate(workspace_id=DEFAULT_SEED_WORKSPACE_ID, **template_data))
