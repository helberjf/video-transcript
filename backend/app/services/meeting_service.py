"""Interlocutores, descricao das capturas e texto final de uma reuniao gravada."""

import base64
import json
import logging
from statistics import median
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core import file_store

from app.models.meeting_capture import MeetingCapture
from app.models.upload import Upload
from app.services.diarization_service import Segment
from app.services.recording_service import hamming_distance
from app.services.settings_service import get_effective_provider_settings
from app.services.usage_service import charge


logger = logging.getLogger("meeting")

SELF_LABEL = "VOCE"
OTHERS_LABEL = "PARTICIPANTES"
SELF_RATIO_THRESHOLD = 0.6
DUPLICATE_HASH_DISTANCE = 6


def format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    return f"{total // 3600:02d}:{total % 3600 // 60:02d}:{total % 60:02d}"


def self_ratio(energy: list[list[float]], start: float, end: float) -> float | None:
    """Fracao da energia que veio do microfone (canal do usuario) entre start e end."""
    mic_total = 0.0
    system_total = 0.0
    for row in energy:
        moment = row[0]
        if start <= moment <= end:
            mic_total += max(0.0, float(row[1]))
            system_total += max(0.0, float(row[2]))
    total = mic_total + system_total
    if total <= 0:
        return None
    return mic_total / total


def build_speakers(
    segments: list[Segment],
    energy: list[list[float]],
    has_speaker_labels: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Rotula os trechos e descobre qual falante e o usuario pela energia do microfone."""
    ratios = [self_ratio(energy, segment.start, segment.end) for segment in segments]

    if not has_speaker_labels:
        # Sem diarizacao (Whisper): so da para separar o usuario dos demais.
        for segment, ratio in zip(segments, ratios):
            segment.speaker = SELF_LABEL if ratio is not None and ratio >= SELF_RATIO_THRESHOLD else OTHERS_LABEL

    by_label: dict[str, list[float]] = {}
    order: list[str] = []
    for segment, ratio in zip(segments, ratios):
        label = segment.speaker or "A"
        segment.speaker = label
        if label not in by_label:
            by_label[label] = []
            order.append(label)
        if ratio is not None:
            by_label[label].append(ratio)

    self_label: str | None = None
    if has_speaker_labels:
        candidates = [
            (median(values), label) for label, values in by_label.items() if values and median(values) >= SELF_RATIO_THRESHOLD
        ]
        if candidates:
            self_label = max(candidates)[1]
    elif SELF_LABEL in by_label:
        self_label = SELF_LABEL

    speakers: list[dict[str, Any]] = []
    other_index = 1
    for label in order:
        is_self = label == self_label
        if is_self:
            name = "Você"
        elif label == OTHERS_LABEL:
            name = "Participantes"
        else:
            name = f"Participante {other_index}"
            other_index += 1
        speakers.append({"label": label, "name": name, "is_self": is_self, "suggested_name": None})

    serialized = [
        {
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "speaker": segment.speaker,
            "text": segment.text,
            "self_ratio": None if ratio is None else round(ratio, 3),
        }
        for segment, ratio in zip(segments, ratios)
    ]
    return serialized, speakers


def load_json_list(value: str | None) -> list[dict[str, Any]]:
    try:
        data = json.loads(value or "[]")
    except ValueError:
        return []
    return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []


def build_meeting_text(upload: Upload, include_captures: bool | None = None) -> str:
    """Texto que o resto do app trata como transcricao: falas por falante e, se pedido, as capturas na linha do tempo."""
    segments = load_json_list(upload.transcript_segments)
    names = {speaker["label"]: speaker.get("name") or speaker["label"] for speaker in load_json_list(upload.speakers)}
    if include_captures is None:
        include_captures = upload.analysis_mode == "audio_images"

    events: list[tuple[float, int, str]] = []
    previous_speaker: str | None = None
    buffer: list[str] = []
    buffer_start = 0.0

    def flush() -> None:
        if previous_speaker is not None and buffer:
            name = names.get(previous_speaker, previous_speaker)
            events.append((buffer_start, 0, f"[{format_timestamp(buffer_start)}] {name}: {' '.join(buffer)}"))

    for segment in segments:
        speaker = segment.get("speaker") or "?"
        if speaker != previous_speaker:
            flush()
            previous_speaker = speaker
            buffer = []
            buffer_start = float(segment.get("start") or 0)
        buffer.append(str(segment.get("text") or "").strip())
    flush()

    if include_captures:
        for index, capture in enumerate(upload.captures, start=1):
            if not capture.included or capture.is_duplicate:
                continue
            description = (capture.description or "").strip() or "imagem sem descricao"
            events.append(
                (capture.offset_seconds, 1, f"[{format_timestamp(capture.offset_seconds)}] [Captura de tela {index}] {description}")
            )

    events.sort(key=lambda event: (event[0], event[1]))
    header = ""
    if names:
        header = "Participantes identificados: " + ", ".join(dict.fromkeys(names.values())) + "\n\n"
    return header + "\n".join(event[2] for event in events)


def mark_duplicate_captures(captures: list[MeetingCapture]) -> None:
    previous_hash: str | None = None
    for capture in captures:
        capture.is_duplicate = False
        if capture.dhash and previous_hash and hamming_distance(capture.dhash, previous_hash) <= DUPLICATE_HASH_DISTANCE:
            capture.is_duplicate = True
            continue
        if capture.dhash:
            previous_hash = capture.dhash


VISION_PROMPT = (
    "Esta e uma captura de tela feita durante uma reuniao por videochamada. "
    "Descreva em portugues, em ate 6 linhas, o que esta sendo mostrado (slide, planilha, documento, codigo, "
    "pessoas na chamada) e transcreva os textos importantes visiveis (titulos, numeros, itens de lista). "
    "Se aparecer o nome de quem esta falando destacado, informe. Nao invente o que nao esta legivel."
)


def _describe_gemini(data: bytes, mime_type: str, api_key: str) -> str:
    from google import genai
    from google.genai import types

    from app.core.config import get_settings

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=get_settings().gemini_report_model,
        contents=[types.Part.from_bytes(data=data, mime_type=mime_type), VISION_PROMPT],
    )
    return (getattr(response, "text", None) or "").strip()


def _describe_openai(data: bytes, mime_type: str, api_key: str) -> str:
    from openai import OpenAI

    from app.core.config import get_settings

    settings = get_settings()
    client = OpenAI(api_key=api_key, timeout=settings.provider_timeout_seconds)
    encoded = base64.b64encode(data).decode("ascii")
    response = client.chat.completions.create(
        model=settings.openai_report_model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{encoded}"}},
                ],
            }
        ],
    )
    return (response.choices[0].message.content or "").strip()


def _describe_claude(data: bytes, mime_type: str, api_key: str) -> str:
    from anthropic import Anthropic

    from app.core.config import get_settings

    settings = get_settings()
    client = Anthropic(api_key=api_key, timeout=settings.provider_timeout_seconds)
    response = client.messages.create(
        model=settings.claude_report_model,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": mime_type, "data": base64.b64encode(data).decode("ascii")},
                    },
                    {"type": "text", "text": VISION_PROMPT},
                ],
            }
        ],
    )
    return "\n".join(getattr(block, "text", "") for block in response.content).strip()


class _CaptureNotDescribed(Exception):
    pass


def _describe_capture(capture: MeetingCapture, data: bytes, providers: list) -> None:
    for name, key, describe in providers:
        if not isinstance(key, str) or not key:
            continue
        try:
            text = describe(data, capture.mime_type, key)
        except Exception as exc:
            logger.warning("[reuniao] visao %s falhou: %s", name, str(exc)[:300])
            print(f"[reuniao] visao {name} falhou: {str(exc)[:300]}", flush=True)
            continue
        if text:
            capture.description = text
            capture.vision_engine = name
            return
    raise _CaptureNotDescribed()


def describe_captures(db: Session, captures: list[MeetingCapture], workspace_id: str = "local-workspace") -> None:
    """Descreve cada captura com a IA de visao: 1 credito por imagem, devolvido se nenhum provedor responder."""
    config = get_effective_provider_settings(db)
    providers = [
        ("gemini", config.get("gemini_api_key"), _describe_gemini),
        ("openai", config.get("openai_api_key"), _describe_openai),
        ("claude", config.get("claude_api_key"), _describe_claude),
    ]
    for capture in captures:
        if not capture.included or capture.is_duplicate or capture.description:
            continue
        data = file_store.get(capture.stored_path, db)
        if not data:
            continue
        try:
            with charge(
                db,
                workspace_id,
                "meeting_image_analysis",
                idempotency_key=f"meeting-capture:{capture.id}",
                metadata={"upload_id": capture.upload_id, "capture_id": capture.id},
            ):
                _describe_capture(capture, data, providers)
        except _CaptureNotDescribed:
            continue
        except HTTPException as exc:
            # Sem creditos para as imagens: a reuniao segue so com o audio.
            print(f"[reuniao] capturas sem descricao: {exc.detail}", flush=True)
            break
        db.commit()
    db.commit()


NAME_SUGGESTION_PROMPT = (
    "Abaixo esta a transcricao de uma reuniao com falantes rotulados. "
    "Descubra o nome real de cada rotulo SOMENTE quando a propria conversa deixar claro "
    "(alguem chama a pessoa pelo nome, a pessoa se apresenta, a captura de tela mostra o nome de quem fala). "
    'Responda apenas com JSON no formato {"A": "Marina", "B": null}. Use null quando nao houver evidencia.\n\n'
)


def suggest_speaker_names(db: Session, upload: Upload) -> dict[str, str]:
    """Pergunta ao modelo de texto quem e quem; e uma sugestao, o usuario confirma na tela."""
    from app.services.report_service import _generate_claude, _generate_gemini, _generate_openai

    segments = load_json_list(upload.transcript_segments)
    if not segments:
        return {}
    lines = [f"[{format_timestamp(float(item.get('start') or 0))}] {item.get('speaker')}: {item.get('text')}" for item in segments]
    transcript = "\n".join(lines)[:60000]
    prompt = NAME_SUGGESTION_PROMPT + transcript

    config = get_effective_provider_settings(db)
    generators = {"openai": _generate_openai, "claude": _generate_claude, "gemini": _generate_gemini}
    for provider in config.get("report_provider_order") or ["openai", "claude", "gemini"]:
        generate = generators.get(str(provider))
        key = config.get(f"{provider}_api_key")
        if not generate or not isinstance(key, str) or not key:
            continue
        try:
            content, _ = generate(prompt, key)
            start, end = content.find("{"), content.rfind("}")
            data = json.loads(content[start : end + 1]) if start >= 0 and end > start else {}
        except Exception as exc:
            logger.warning("[reuniao] sugestao de nomes via %s falhou: %s", provider, str(exc)[:300])
            continue
        return {str(label): str(name).strip() for label, name in data.items() if isinstance(name, str) and name.strip()}
    return {}


def apply_name_suggestions(upload: Upload, suggestions: dict[str, str]) -> None:
    speakers = load_json_list(upload.speakers)
    for speaker in speakers:
        suggestion = suggestions.get(speaker["label"])
        if suggestion and not speaker.get("is_self"):
            speaker["suggested_name"] = suggestion
            speaker["name"] = suggestion
    upload.speakers = json.dumps(speakers, ensure_ascii=False)


def rename_speakers(upload: Upload, names: dict[str, str]) -> None:
    speakers = load_json_list(upload.speakers)
    for speaker in speakers:
        new_name = (names.get(speaker["label"]) or "").strip()
        if new_name:
            speaker["name"] = new_name[:80]
    upload.speakers = json.dumps(speakers, ensure_ascii=False)
    upload.transcription_text = build_meeting_text(upload)
