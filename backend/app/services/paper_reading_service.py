"""Le fotos ou scans de anotacoes (inclusive manuscritas) e encaixa os dados nos campos de um modelo."""

import json

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.enums import TranscriptionEngine
from app.repositories.report_template_repository import ReportTemplateRepository
from app.schemas.form import FormPaperReadResponse
from app.services.form_service import _coerce_detected_fields, _extract_json_object, _template_field_specs
from app.services.vision_service import IMAGE_TYPES, PDF_TYPE, VisionFile, normalize_mime, read_with_vision


MAX_FILES = 10
MAX_FILE_BYTES = 15 * 1024 * 1024
ENGINE_BY_PROVIDER = {
    "gemini": TranscriptionEngine.GEMINI,
    "openai": TranscriptionEngine.OPENAI,
    "claude": TranscriptionEngine.CLAUDE,
}


def build_paper_prompt(field_specs: list[dict[str, str]], additional_instructions: str | None) -> str:
    expected = {
        "transcricao": "tudo o que esta escrito no papel, linha por linha",
        "fields": {field["key"]: "" for field in field_specs},
        "incertos": ["chaves dos campos cuja letra estava dificil de ler"],
    }
    sections = [
        "Voce recebe fotos ou scans de um papel com anotacoes, muitas vezes escritas a mao, "
        "com os dados de uma pessoa ou situacao. Esses dados vao preencher um documento-modelo.",
        "1. Transcreva fielmente tudo o que esta escrito, inclusive a mao, na ordem do papel.",
        "2. Encaixe cada dado no campo do modelo a que ele corresponde, pelo significado "
        "(ex.: 'CPF' ou 'doc' -> campo de CPF; uma data escrita perto de 'nasc.' -> data de nascimento). "
        "Copie o valor como esta escrito, sem completar nem inventar.",
        "3. Se um campo nao aparece no papel, deixe string vazia. Se a letra estiver ambigua, "
        "escreva a leitura mais provavel e coloque a chave do campo em 'incertos'.",
        "Datas no formato dd/mm/aaaa quando o papel trouxer dia, mes e ano.",
        "Responda SOMENTE com JSON valido, sem markdown, neste formato:",
        json.dumps(expected, ensure_ascii=False),
        f"Campos do modelo:\n{json.dumps(field_specs, ensure_ascii=False)}",
    ]
    if additional_instructions:
        sections.append(f"Instrucoes extras:\n{additional_instructions}")
    return "\n\n".join(sections)


def read_upload_files(files: list[UploadFile]) -> list[VisionFile]:
    if not files:
        raise ValueError("Envie pelo menos uma foto ou PDF do papel.")
    if len(files) > MAX_FILES:
        raise ValueError(f"Envie no maximo {MAX_FILES} arquivos por vez.")
    vision_files: list[VisionFile] = []
    for upload in files:
        mime = normalize_mime(upload.content_type, upload.filename)
        if mime not in IMAGE_TYPES and mime != PDF_TYPE:
            raise ValueError(f"{upload.filename or 'Arquivo'}: envie foto (JPG, PNG, WebP) ou PDF.")
        data = upload.file.read(MAX_FILE_BYTES + 1)
        if not data:
            raise ValueError(f"{upload.filename or 'Arquivo'} esta vazio.")
        if len(data) > MAX_FILE_BYTES:
            raise ValueError(f"{upload.filename or 'Arquivo'} passa de 15 MB.")
        vision_files.append(VisionFile(data=data, mime_type=mime, name=upload.filename or "papel"))
    return vision_files


def read_paper_fields(
    db: Session,
    template_id: str,
    files: list[UploadFile],
    additional_instructions: str | None = None,
    workspace_id: str = "local-workspace",
) -> FormPaperReadResponse:
    template = ReportTemplateRepository(db).get_for_workspace(template_id, workspace_id)
    if not template:
        raise ValueError("Modelo nao encontrado")
    field_specs = _template_field_specs(template.form_fields)
    if not field_specs:
        raise ValueError("Este modelo nao tem campos de formulario definidos")

    vision_files = read_upload_files(files)
    raw, provider = read_with_vision(db, build_paper_prompt(field_specs, additional_instructions), vision_files)

    parsed = _extract_json_object(raw)
    fields = _coerce_detected_fields(raw, field_specs)
    transcription = parsed.get("transcricao")
    uncertain = parsed.get("incertos")
    valid_keys = {field["key"] for field in field_specs}
    return FormPaperReadResponse(
        template_id=template.id,
        fields=fields,
        transcription=transcription.strip() if isinstance(transcription, str) else "",
        uncertain_fields=[key for key in uncertain if key in valid_keys] if isinstance(uncertain, list) else [],
        generator_engine=ENGINE_BY_PROVIDER.get(provider, TranscriptionEngine.NONE),
    )
