"""Modo ao vivo: transcricao de janelas curtas de audio e sugestoes da IA durante a chamada."""

import logging
import time
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.settings_service import get_effective_provider_settings
from app.services.transcription_service import _language_hint


logger = logging.getLogger("live")

MAX_WINDOW_BYTES = 4 * 1024 * 1024
MAX_TRANSCRIPT_CHARS = 24_000

# O Whisper alucina frases fixas em trechos de silencio/ruido; nao vale mostrar ao usuario.
HALLUCINATION_MARKERS = (
    "legendas pela comunidade",
    "obrigado por assistir",
    "inscreva-se",
    "amara.org",
    "thanks for watching",
)


def _is_noise(text: str) -> bool:
    lowered = text.lower().strip()
    return not lowered or any(marker in lowered for marker in HALLUCINATION_MARKERS)


def _transcribe_window_openai(path: Path, language: str | None, prompt: str | None, api_key: str) -> str:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=api_key, timeout=30)
    with path.open("rb") as audio_file:
        response = client.audio.transcriptions.create(
            model=settings.openai_transcription_model,
            file=audio_file,
            language=_language_hint(language),
            prompt=(prompt or "")[-400:] or None,
        )
    return (getattr(response, "text", None) or "").strip()


def _transcribe_window_gemini(path: Path, language: str | None, api_key: str) -> str:
    from google import genai
    from google.genai import types

    settings = get_settings()
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=settings.gemini_transcription_model,
        contents=[
            types.Part.from_bytes(data=path.read_bytes(), mime_type="audio/webm"),
            "Transcreva literalmente a fala deste trecho curto de audio. "
            f"Idioma: {language or 'auto'}. Se nao houver fala, responda vazio. Responda so com a transcricao.",
        ],
    )
    return (getattr(response, "text", None) or "").strip()


def transcribe_window(db: Session, data: bytes, language: str | None, prompt: str | None) -> tuple[str, str]:
    if not data:
        return "", "none"
    if len(data) > MAX_WINDOW_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Trecho de audio grande demais")

    config = get_effective_provider_settings(db)
    attempts = [
        ("openai", config.get("openai_api_key"), lambda path, key: _transcribe_window_openai(path, language, prompt, key)),
        ("gemini", config.get("gemini_api_key"), lambda path, key: _transcribe_window_gemini(path, language, key)),
    ]
    if not any(isinstance(key, str) and key for _, key, _ in attempts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O modo ao vivo precisa de uma chave da OpenAI ou do Gemini em Ajustes.",
        )

    with NamedTemporaryFile(suffix=".webm", delete=False, dir=get_settings().temp_dir) as handle:
        handle.write(data)
        path = Path(handle.name)
    try:
        for name, key, run in attempts:
            if not isinstance(key, str) or not key:
                continue
            try:
                text = run(path, key)
            except Exception as exc:
                logger.warning("[ao vivo] %s falhou: %s", name, str(exc)[:300])
                print(f"[ao vivo] transcricao {name} falhou: {str(exc)[:300]}", flush=True)
                continue
            return ("" if _is_noise(text) else text), name
    finally:
        path.unlink(missing_ok=True)
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Nenhum provedor conseguiu transcrever o trecho")


SUGGESTION_SYSTEM = (
    "Voce e um copiloto discreto para reunioes por videochamada, ajudando a pessoa identificada como 'Voce'. "
    "Com base na conversa ate agora e no contexto que ela forneceu, sugira o que ela pode responder ou dizer em seguida. "
    "Responda em portugues, pronto para ser falado: primeiro uma resposta direta de 2 a 4 frases, depois ate 3 "
    "topicos curtos com pontos de apoio (dados, exemplos, perguntas para devolver). Use o contexto da pessoa quando "
    "for relevante. Nunca afirme fatos (andamento, numeros, datas, nomes) que nao estejam no contexto ou na conversa: "
    "quando a resposta depender disso, deixe um marcador como [confirmar andamento] para ela completar. "
    "Seja breve: ela vai ler isso durante a chamada."
)


def _build_suggestion_prompt(lines: list[dict], context: str | None, focus: str | None) -> str:
    conversation = "\n".join(f"{line.get('speaker') or '?'}: {str(line.get('text') or '').strip()}" for line in lines)
    conversation = conversation[-MAX_TRANSCRIPT_CHARS:]
    parts = []
    if context and context.strip():
        parts.append(f"Contexto da pessoa (quem ela e, objetivo da reuniao, anotacoes):\n{context.strip()[:6000]}")
    parts.append(f"Conversa ate agora (mais recente por ultimo):\n{conversation or '(ainda sem falas)'}")
    if focus and focus.strip():
        parts.append(f"Ela pediu ajuda especificamente com: {focus.strip()[:500]}")
    else:
        parts.append("Foque na ultima pergunta ou no ultimo ponto levantado pelos participantes.")
    return "\n\n".join(parts)


def _suggest_openai(prompt: str, api_key: str) -> str:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=api_key, timeout=40)
    response = client.chat.completions.create(
        model=settings.openai_report_model,
        messages=[{"role": "system", "content": SUGGESTION_SYSTEM}, {"role": "user", "content": prompt}],
        max_tokens=500,
    )
    return (response.choices[0].message.content or "").strip()


def _suggest_claude(prompt: str, api_key: str) -> str:
    from anthropic import Anthropic

    settings = get_settings()
    client = Anthropic(api_key=api_key, timeout=40)
    response = client.messages.create(
        model=settings.claude_report_model,
        max_tokens=600,
        system=SUGGESTION_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    return "\n".join(getattr(block, "text", "") for block in response.content).strip()


def _suggest_gemini(prompt: str, api_key: str) -> str:
    from google import genai

    settings = get_settings()
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=settings.gemini_report_model,
        contents=f"{SUGGESTION_SYSTEM}\n\n{prompt}",
    )
    return (getattr(response, "text", None) or "").strip()


def suggest_reply(db: Session, lines: list[dict], context: str | None, focus: str | None) -> tuple[str, str, float]:
    config = get_effective_provider_settings(db)
    prompt = _build_suggestion_prompt(lines, context, focus)
    generators = {"openai": _suggest_openai, "claude": _suggest_claude, "gemini": _suggest_gemini}
    started = time.monotonic()
    for provider in config.get("report_provider_order") or ["openai", "claude", "gemini"]:
        generate = generators.get(str(provider))
        key = config.get(f"{provider}_api_key")
        if not generate or not isinstance(key, str) or not key:
            continue
        try:
            text = generate(prompt, key)
        except Exception as exc:
            print(f"[ao vivo] sugestao {provider} falhou: {str(exc)[:300]}", flush=True)
            continue
        if text:
            return text, str(provider), round(time.monotonic() - started, 2)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Nenhum provedor de IA disponivel para sugestoes. Configure uma chave em Ajustes.",
    )
