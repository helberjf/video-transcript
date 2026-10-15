from sqlalchemy.orm import Session

from app.models.enums import ReportFormat
from app.models.report_template import ReportTemplate
from app.repositories.report_template_repository import ReportTemplateRepository

DEFAULT_SEED_WORKSPACE_ID = "local-workspace"

DEFAULT_TEMPLATE_NAME = "Resumo objetivo"
DETAILED_SUMMARY_TEMPLATE_NAME = "Resumo detalhado"
MEETING_TEMPLATE_NAME = "Reunião: ata e próximos passos"

DEFAULT_TEMPLATES = [
    {
        "name": DETAILED_SUMMARY_TEMPLATE_NAME,
        "description": "Explica todos os pontos do conteúdo para quem lê conseguir ensinar a outra pessoa.",
        "category": "resumo",
        "base_prompt": (
            "Escreva um resumo detalhado e didático da transcrição, pensado para que quem ler consiga "
            "entender e depois ensinar a outra pessoa tudo o que foi dito. Percorra o conteúdo na ordem "
            "em que aparece e cubra todos os pontos, sem pular nenhum tema relevante. Para cada ponto, "
            "explique a ideia com as próprias palavras, o porquê dela, e inclua os exemplos, números, "
            "nomes, passos e recomendações citados. Defina termos técnicos na primeira vez que aparecem. "
            "Não invente nada que não esteja na transcrição."
        ),
        "example_output": (
            "# Resumo detalhado\n\n"
            "## Visão geral\n"
            "Do que se trata, para quem é e qual a mensagem central, em um parágrafo.\n\n"
            "## 1. Primeiro tema\n"
            "Explicação do que foi dito, com o raciocínio por trás.\n"
            "- Exemplo ou dado citado\n"
            "- Detalhe importante\n\n"
            "## 2. Segundo tema\n"
            "Explicação do que foi dito, com o raciocínio por trás.\n\n"
            "## Termos e conceitos\n"
            "- **Termo**: definição simples\n\n"
            "## Como explicar para alguém\n"
            "1. Ideia principal em uma frase\n"
            "2. Os pontos que sustentam essa ideia\n"
            "3. O que fazer na prática\n\n"
            "## Pontos-chave para lembrar\n"
            "- Ponto 1\n"
            "- Ponto 2"
        ),
        "complementary_instructions": (
            "Use linguagem simples e parágrafos curtos. Prefira explicar a só listar. "
            "Se algo não estiver claro no áudio, escreva 'Não informado na transcrição'."
        ),
        "output_format": ReportFormat.MARKDOWN,
        "is_favorite": True,
    },
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
        "name": MEETING_TEMPLATE_NAME,
        "description": "Para reuniões gravadas: quem disse o quê, decisões, itens de ação e o que foi mostrado na tela.",
        "category": "reuniao",
        "base_prompt": (
            "A transcrição é de uma reunião gravada, com cada fala marcada por [hh:mm:ss] e pelo nome do interlocutor. "
            "Linhas '[Captura de tela N]' descrevem o que estava sendo mostrado na tela naquele momento. "
            "Escreva a ata da reunião: resumo executivo, participantes e a contribuição de cada um, decisões tomadas, "
            "itens de ação com responsável, prazo e o minuto em que foram combinados, pendências e riscos, "
            "e os principais tópicos na ordem em que aconteceram. Quando houver capturas de tela, use o que foi "
            "mostrado para completar o contexto e cite a captura. Atribua cada fala a quem realmente a disse."
        ),
        "example_output": (
            "# Ata da reunião\n\n"
            "## Resumo executivo\nDo que se tratou e o que ficou decidido, em até 5 linhas.\n\n"
            "## Participantes\n- **Nome**: papel na conversa e principais contribuições\n\n"
            "## Decisões\n- Decisão (00:12:30, proposta por Nome)\n\n"
            "## Itens de ação\n| Responsável | Ação | Prazo | Minuto |\n|---|---|---|---|\n| Nome | O que fazer | data ou 'não definido' | 00:15:10 |\n\n"
            "## Pendências e riscos\n- Item em aberto\n\n"
            "## Tópicos discutidos\n### 00:00 Tema\nO que foi dito, por quem, e o que foi mostrado na tela.\n\n"
            "## Mostrado na tela\n- Captura 2 (00:08:40): slide com ..."
        ),
        "complementary_instructions": (
            "Não invente responsáveis nem prazos: escreva 'não definido' quando a conversa não disser. "
            "Se só houver 'Você' e 'Participantes', mantenha esses rótulos."
        ),
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
