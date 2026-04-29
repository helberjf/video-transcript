import json
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.enums import TranscriptionEngine
from app.repositories.report_template_repository import ReportTemplateRepository
from app.schemas.form import FormDetectFieldsRequest, FormDetectFieldsResponse, FormFillFieldsRequest, FormFillRequest, FormFillResponse
from app.schemas.report import ReportExportExtension
from app.services.report_service import (
    REPORT_EXPORT_MEDIA_TYPES,
    _generate_claude,
    _generate_gemini,
    _generate_local_fallback,
    _generate_openai,
    _report_provider_order,
    build_export_download_filename,
    build_report_prompt,
    write_docx_export,
    write_pdf_export,
)
from app.services.settings_service import get_effective_provider_settings


@dataclass(frozen=True)
class FormExportArtifact:
    path: Path
    media_type: str
    filename: str


def _build_form_prompt(payload: FormFillRequest, template_prompt: str, example_output: str | None, additional_instructions: str | None) -> str:
    return build_report_prompt(
        transcription=payload.source_text,
        template_prompt=template_prompt,
        example_output=example_output,
        custom_request=(
            "Preencha o modelo de documento como uma sugestao pronta para revisao. "
            "Use o audio transcrito ou texto como fonte dos dados."
        ),
        additional_instructions=additional_instructions,
    )


def _run_report_provider_chain(
    db: Session,
    prompt: str,
    local_fallback_title: str,
    local_fallback_source: str,
    local_fallback_request: str,
) -> tuple[str, TranscriptionEngine]:
    settings_data = get_effective_provider_settings(db)
    content: str | None = None
    engine = TranscriptionEngine.NONE
    for provider in _report_provider_order(settings_data):
        try:
            if provider == "openai" and isinstance(settings_data.get("openai_api_key"), str) and settings_data["openai_api_key"]:
                content, engine = _generate_openai(prompt, str(settings_data["openai_api_key"]))
                break
            if provider == "claude" and isinstance(settings_data.get("claude_api_key"), str) and settings_data["claude_api_key"]:
                content, engine = _generate_claude(prompt, str(settings_data["claude_api_key"]))
                break
            if provider == "gemini" and isinstance(settings_data.get("gemini_api_key"), str) and settings_data["gemini_api_key"]:
                content, engine = _generate_gemini(prompt, str(settings_data["gemini_api_key"]))
                break
            if provider == "local":
                content, engine = _generate_local_fallback(local_fallback_title, local_fallback_source, local_fallback_request)
                break
        except Exception:
            continue

    if content is None:
        content, engine = _generate_local_fallback(local_fallback_title, local_fallback_source, local_fallback_request)
    return content, engine


def _template_field_specs(template_fields: list[dict] | None) -> list[dict[str, str]]:
    specs: list[dict[str, str]] = []
    for item in template_fields or []:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if not isinstance(key, str) or not key.strip():
            continue
        label = item.get("label") if isinstance(item.get("label"), str) and item["label"].strip() else key
        field_type = item.get("type") if item.get("type") in {"text", "textarea", "date", "number"} else "text"
        help_text = item.get("help") if isinstance(item.get("help"), str) and item["help"].strip() else ""
        specs.append(
            {
                "key": key.strip(),
                "label": label.strip(),
                "type": str(field_type),
                "help": help_text.strip(),
            }
        )
    return specs


def _build_field_detection_prompt(payload: FormDetectFieldsRequest, field_specs: list[dict[str, str]]) -> str:
    expected = {field["key"]: "" for field in field_specs}
    sections = [
        "Voce extrai valores de um documento para preencher um formulario.",
        "Use somente informacoes presentes no texto. Nao invente valores.",
        "Quando um campo nao estiver claro, retorne string vazia para esse campo.",
        "Retorne somente JSON valido, sem markdown, com exatamente as chaves pedidas.",
        f"Campos do formulario:\n{json.dumps(field_specs, ensure_ascii=False)}",
        f"Formato esperado:\n{json.dumps(expected, ensure_ascii=False)}",
        f"Texto do documento:\n{payload.source_text[:16000]}",
    ]
    if payload.additional_instructions:
        sections.append(f"Instrucoes extras:\n{payload.additional_instructions}")
    return "\n\n".join(sections)


def _run_field_detection_provider_chain(db: Session, prompt: str) -> tuple[str | None, TranscriptionEngine]:
    settings_data = get_effective_provider_settings(db)
    for provider in _report_provider_order(settings_data):
        try:
            if provider == "openai" and isinstance(settings_data.get("openai_api_key"), str) and settings_data["openai_api_key"]:
                return _generate_openai(prompt, str(settings_data["openai_api_key"]))
            if provider == "claude" and isinstance(settings_data.get("claude_api_key"), str) and settings_data["claude_api_key"]:
                return _generate_claude(prompt, str(settings_data["claude_api_key"]))
            if provider == "gemini" and isinstance(settings_data.get("gemini_api_key"), str) and settings_data["gemini_api_key"]:
                return _generate_gemini(prompt, str(settings_data["gemini_api_key"]))
        except Exception:
            continue
    return None, TranscriptionEngine.NONE


def _extract_json_object(raw: str) -> dict[str, object]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise ValueError("A IA nao retornou JSON valido") from None
        parsed = json.loads(match.group(0))

    if not isinstance(parsed, dict):
        raise ValueError("A IA retornou um formato inesperado")
    return parsed


def _coerce_detected_fields(raw_response: str, field_specs: list[dict[str, str]]) -> dict[str, str]:
    parsed = _extract_json_object(raw_response)
    raw_fields = parsed.get("fields") if isinstance(parsed.get("fields"), dict) else parsed
    if not isinstance(raw_fields, dict):
        raw_fields = {}

    detected: dict[str, str] = {}
    for field in field_specs:
        raw_value = raw_fields.get(field["key"], "")
        if raw_value is None:
            detected[field["key"]] = ""
        elif isinstance(raw_value, (str, int, float, bool)):
            detected[field["key"]] = str(raw_value).strip()
        else:
            detected[field["key"]] = ""
    return detected


def _field_aliases(field: dict[str, str]) -> list[str]:
    aliases = [
        field["key"],
        field["key"].replace("_", " "),
        field["label"],
    ]
    seen: list[str] = []
    for alias in aliases:
        normalized = alias.strip()
        if normalized and normalized.lower() not in {item.lower() for item in seen}:
            seen.append(normalized)
    return seen


def _clean_detected_line_value(value: str) -> str:
    value = re.split(r"\s{2,}|\s+\|\s+", value.strip(), maxsplit=1)[0]
    return value.strip(" -:=\t")[:500]


def _detect_fields_locally(field_specs: list[dict[str, str]], source_text: str) -> dict[str, str]:
    lines = [line.strip() for line in source_text.replace("\r\n", "\n").split("\n") if line.strip()]
    detected: dict[str, str] = {field["key"]: "" for field in field_specs}

    for field in field_specs:
        for line in lines:
            for alias in _field_aliases(field):
                match = re.search(rf"(?:^|\b){re.escape(alias)}\s*[:=\-]\s*(.+)$", line, flags=re.IGNORECASE)
                if match:
                    detected[field["key"]] = _clean_detected_line_value(match.group(1))
                    break
            if detected[field["key"]]:
                break

        if detected[field["key"]]:
            continue

        if field["type"] == "date":
            match = re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", source_text)
            if match:
                detected[field["key"]] = match.group(0)
        elif field["type"] == "number":
            match = re.search(r"\b\d+(?:[.,]\d+)?\b", source_text)
            if match:
                detected[field["key"]] = match.group(0)

    return detected


def detect_form_fields(db: Session, payload: FormDetectFieldsRequest, workspace_id: str = "local-workspace") -> FormDetectFieldsResponse:
    template = ReportTemplateRepository(db).get_for_workspace(payload.template_id, workspace_id)
    if not template:
        raise ValueError("Modelo nao encontrado")

    field_specs = _template_field_specs(template.form_fields)
    if not field_specs:
        raise ValueError("Este modelo nao tem campos de formulario definidos")

    prompt = _build_field_detection_prompt(payload, field_specs)
    raw_response, engine = _run_field_detection_provider_chain(db, prompt)
    ai_fields: dict[str, str] = {}
    if raw_response:
        try:
            ai_fields = _coerce_detected_fields(raw_response, field_specs)
        except ValueError:
            ai_fields = {}

    local_fields = _detect_fields_locally(field_specs, payload.source_text)
    fields = {
        field["key"]: (ai_fields.get(field["key"]) or local_fields.get(field["key"]) or "").strip()
        for field in field_specs
    }

    return FormDetectFieldsResponse(
        template_id=template.id,
        fields=fields,
        generator_engine=engine,
    )


def fill_form_from_text(db: Session, payload: FormFillRequest, workspace_id: str = "local-workspace") -> FormFillResponse:
    template = ReportTemplateRepository(db).get_for_workspace(payload.template_id, workspace_id)
    if not template:
        raise ValueError("Modelo nao encontrado")

    prompt = _build_form_prompt(
        payload,
        template_prompt=template.base_prompt,
        example_output=template.example_output,
        additional_instructions=payload.additional_instructions or template.complementary_instructions,
    )
    content, engine = _run_report_provider_chain(
        db,
        prompt,
        local_fallback_title=payload.title,
        local_fallback_source=payload.source_text,
        local_fallback_request="Preencher modelo",
    )

    return FormFillResponse(
        template_id=template.id,
        title=payload.title,
        content=content,
        output_format=template.output_format,
        generator_engine=engine,
    )


def _substitute_placeholders(example_output: str, fields: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        raw_key = match.group(1).strip()
        candidates = [raw_key, raw_key.lower(), raw_key.replace(" ", "_").lower()]
        for candidate in candidates:
            if candidate in fields:
                return fields[candidate]
        return match.group(0)

    return re.sub(r"\{\{\s*([^}]+?)\s*\}\}", replace, example_output)


def _format_fields_as_text(template_fields: list[dict] | None, fields: dict[str, str]) -> str:
    labels_by_key: dict[str, str] = {}
    if template_fields:
        for item in template_fields:
            key = item.get("key") if isinstance(item, dict) else None
            label = item.get("label") if isinstance(item, dict) else None
            if isinstance(key, str) and isinstance(label, str):
                labels_by_key[key] = label

    lines: list[str] = []
    for key, value in fields.items():
        label = labels_by_key.get(key, key.replace("_", " ").capitalize())
        clean_value = value.strip() if isinstance(value, str) else ""
        lines.append(f"- {label}: {clean_value or 'Nao informado'}")
    return "\n".join(lines) if lines else "Nenhum campo informado."


def fill_form_from_fields(db: Session, payload: FormFillFieldsRequest, workspace_id: str = "local-workspace") -> FormFillResponse:
    template = ReportTemplateRepository(db).get_for_workspace(payload.template_id, workspace_id)
    if not template:
        raise ValueError("Modelo nao encontrado")

    example_output = template.example_output or "# Documento preenchido\n\n{{conteudo}}"
    fields = {key: (value or "").strip() for key, value in payload.fields.items()}

    if not payload.ai_polish:
        content = _substitute_placeholders(example_output, fields)
        return FormFillResponse(
            template_id=template.id,
            title=payload.title,
            content=content,
            output_format=template.output_format,
            generator_engine=TranscriptionEngine.NONE,
        )

    source_text = _format_fields_as_text(template.form_fields, fields)
    prompt = build_report_prompt(
        transcription=f"Campos preenchidos pelo usuario:\n{source_text}",
        template_prompt=template.base_prompt,
        example_output=example_output,
        custom_request=(
            "Preencha o modelo de documento usando exatamente os valores informados nos campos. "
            "Substitua cada placeholder ({{...}}) pelo valor correspondente. "
            "Quando um campo estiver vazio, escreva 'Nao informado'."
        ),
        additional_instructions=payload.additional_instructions or template.complementary_instructions,
    )
    content, engine = _run_report_provider_chain(
        db,
        prompt,
        local_fallback_title=payload.title,
        local_fallback_source=source_text,
        local_fallback_request="Preencher modelo por campos",
    )
    if engine == TranscriptionEngine.NONE:
        content = _substitute_placeholders(example_output, fields)

    return FormFillResponse(
        template_id=template.id,
        title=payload.title,
        content=content,
        output_format=template.output_format,
        generator_engine=engine,
    )


def build_form_export(title: str, content: str, extension: ReportExportExtension) -> FormExportArtifact:
    temp_dir = Path(tempfile.mkdtemp(prefix="form-export-"))
    export_path = temp_dir / f"formulario.{extension.value}"

    if extension == ReportExportExtension.MD:
        export_path.write_text(content, encoding="utf-8")
    elif extension == ReportExportExtension.TXT:
        export_path.write_text(content, encoding="utf-8")
    elif extension == ReportExportExtension.DOCX:
        write_docx_export(export_path, content)
    elif extension == ReportExportExtension.PDF:
        write_pdf_export(export_path, title, content)
    else:
        raise ValueError("Formato de exportacao nao suportado")

    return FormExportArtifact(
        path=export_path,
        media_type=REPORT_EXPORT_MEDIA_TYPES[extension],
        filename=build_export_download_filename(title, extension, fallback="formulario"),
    )
