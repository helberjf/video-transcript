"""Resultado da reuniao gerado pela IA: resumo, decisoes, checklist de tarefas e perguntas sobre a reuniao."""

import json
import logging
import re
from datetime import datetime
from typing import Any, Callable

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.upload import Upload
from app.services.settings_service import get_effective_provider_settings


logger = logging.getLogger("meeting_insights")

MAX_TRANSCRIPT_CHARS = 120_000
MAX_QA_HISTORY = 50

INSIGHTS_PROMPT = """Voce recebe a transcricao de uma reuniao. Cada linha traz [hh:mm:ss] e o nome de quem falou;
linhas "[Captura de tela N]" descrevem o que estava sendo mostrado na tela naquele momento.

Responda SOMENTE com um objeto JSON valido, sem texto antes ou depois, neste formato:
{
  "titulo": "titulo curto da reuniao (ate 8 palavras)",
  "resumo": "resumo objetivo em 4 a 8 frases: do que se tratou e o que ficou decidido",
  "decisoes": ["decisao tomada, com quem decidiu quando estiver claro"],
  "checklist": [
    {"tarefa": "acao concreta comecando com verbo", "responsavel": "nome ou null", "prazo": "prazo citado ou null", "minuto": "hh:mm:ss em que foi combinado ou null"}
  ],
  "pendencias": ["assunto que ficou em aberto ou sem dono"],
  "proximos_passos": ["o que acontece depois da reuniao"]
}

Regras:
- Use apenas o que esta na transcricao. Nao invente nomes, prazos nem tarefas.
- O checklist deve ter TODAS as tarefas combinadas, uma por item, mesmo as pequenas.
- Se algo nao existir, use lista vazia ou null.
- Escreva em portugues.

Transcricao:
"""

QA_PROMPT = """Voce responde perguntas sobre uma reuniao gravada, usando somente a transcricao abaixo
(linhas com [hh:mm:ss] e o nome de quem falou; "[Captura de tela N]" descreve o que estava na tela).
Responda em portugues, direto ao ponto, e cite o minuto [hh:mm:ss] de onde tirou cada informacao.
Se a reuniao nao responder a pergunta, diga isso claramente em vez de supor.

Transcricao:
{transcript}

{history}Pergunta: {question}"""


def load_insights(upload: Upload) -> dict[str, Any]:
    try:
        data = json.loads(upload.meeting_insights or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def save_insights(upload: Upload, insights: dict[str, Any]) -> None:
    upload.meeting_insights = json.dumps(insights, ensure_ascii=False)


def _text_generators() -> dict[str, Callable[[str, str], tuple[str, Any]]]:
    from app.services.report_service import _generate_claude, _generate_gemini, _generate_openai

    return {"openai": _generate_openai, "claude": _generate_claude, "gemini": _generate_gemini}


def _run_chain(db: Session, prompt: str) -> tuple[str, str]:
    config = get_effective_provider_settings(db)
    generators = _text_generators()
    errors: list[str] = []
    for provider in config.get("report_provider_order") or ["openai", "claude", "gemini"]:
        generate = generators.get(str(provider))
        key = config.get(f"{provider}_api_key")
        if not generate or not isinstance(key, str) or not key:
            continue
        try:
            content, _engine = generate(prompt, key)
        except Exception as exc:
            detail = str(exc).strip()[:300] or exc.__class__.__name__
            errors.append(f"{provider}: {detail}")
            print(f"[reuniao] {provider} falhou: {detail}", flush=True)
            continue
        if content and content.strip():
            return content.strip(), str(provider)
    if errors:
        raise RuntimeError("; ".join(errors))
    raise RuntimeError("Nenhuma chave de IA configurada em Ajustes (OpenAI, Claude ou Gemini).")


def _parse_json_object(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fenced:
        cleaned = fenced.group(1).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("A IA nao devolveu JSON")
    data = json.loads(cleaned[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("JSON inesperado")
    return data


def _str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return None if not text or text.lower() in {"null", "none", "n/a", "-"} else text[:300]


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [text for text in (_str_or_none(item) for item in value) if text]


def normalize_insights(data: dict[str, Any]) -> dict[str, Any]:
    """Garante o formato esperado pela tela, mesmo quando a IA varia as chaves ou os tipos."""
    checklist = []
    for item in data.get("checklist") or []:
        if isinstance(item, str):
            item = {"tarefa": item}
        if not isinstance(item, dict):
            continue
        task = _str_or_none(item.get("tarefa") or item.get("task") or item.get("acao"))
        if not task:
            continue
        # A IA as vezes devolve "enviar o orcamento"; no checklist fica melhor com inicial maiuscula.
        task = task[0].upper() + task[1:]
        checklist.append(
            {
                "tarefa": task,
                "responsavel": _str_or_none(item.get("responsavel")),
                "prazo": _str_or_none(item.get("prazo")),
                "minuto": _str_or_none(item.get("minuto")),
                "feito": bool(item.get("feito", False)),
            }
        )
    return {
        "titulo": _str_or_none(data.get("titulo")),
        "resumo": str(data.get("resumo") or "").strip(),
        "decisoes": _str_list(data.get("decisoes")),
        "checklist": checklist,
        "pendencias": _str_list(data.get("pendencias")),
        "proximos_passos": _str_list(data.get("proximos_passos")),
    }


def generate_insights(db: Session, upload: Upload) -> dict[str, Any]:
    transcript = (upload.transcription_text or "").strip()
    if not transcript:
        raise ValueError("A reuniao ainda nao tem transcricao")
    content, engine = _run_chain(db, INSIGHTS_PROMPT + transcript[:MAX_TRANSCRIPT_CHARS])
    insights = normalize_insights(_parse_json_object(content))
    previous = load_insights(upload)
    insights.update(
        {
            "engine": engine,
            "gerado_em": datetime.utcnow().isoformat(timespec="seconds"),
            "perguntas": previous.get("perguntas") or [],
            "erro": None,
        }
    )
    save_insights(upload, insights)
    return insights


def mark_insights_error(upload: Upload, message: str) -> None:
    insights = load_insights(upload)
    insights["erro"] = message[:500]
    save_insights(upload, insights)


def set_checklist_item(upload: Upload, index: int, done: bool) -> dict[str, Any]:
    insights = load_insights(upload)
    checklist = insights.get("checklist") or []
    if index < 0 or index >= len(checklist):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item do checklist nao encontrado")
    checklist[index]["feito"] = done
    save_insights(upload, insights)
    return insights


def add_checklist_item(upload: Upload, task: str) -> dict[str, Any]:
    insights = load_insights(upload)
    insights.setdefault("checklist", []).append(
        {"tarefa": task.strip()[:300], "responsavel": None, "prazo": None, "minuto": None, "feito": False}
    )
    save_insights(upload, insights)
    return insights


def ask_question(db: Session, upload: Upload, question: str) -> dict[str, Any]:
    question = question.strip()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Escreva uma pergunta")
    transcript = (upload.transcription_text or "").strip()
    if not transcript:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A reuniao ainda esta sendo processada")

    insights = load_insights(upload)
    history = insights.get("perguntas") or []
    recent = history[-4:]
    history_text = "".join(f"Pergunta anterior: {item['pergunta']}\nResposta: {item['resposta']}\n\n" for item in recent)
    prompt = QA_PROMPT.format(transcript=transcript[:MAX_TRANSCRIPT_CHARS], history=history_text, question=question[:1000])
    try:
        answer, engine = _run_chain(db, prompt)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    entry = {"pergunta": question[:1000], "resposta": answer, "engine": engine, "em": datetime.utcnow().isoformat(timespec="seconds")}
    insights["perguntas"] = [*history, entry][-MAX_QA_HISTORY:]
    save_insights(upload, insights)
    return entry
