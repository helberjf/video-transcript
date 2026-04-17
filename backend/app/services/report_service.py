from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.enums import ProcessingStatus, ReportFormat, TranscriptionEngine
from app.models.report import GeneratedReport
from app.repositories.report_repository import ReportRepository
from app.repositories.report_template_repository import ReportTemplateRepository
from app.repositories.upload_repository import UploadRepository
from app.schemas.report import GenerateReportRequest
from app.services.settings_service import get_effective_provider_settings


def build_report_prompt(transcription: str, template_prompt: str | None, custom_request: str | None, additional_instructions: str | None) -> str:
    sections = [
        "Você vai gerar um relatório estruturado a partir de uma transcrição.",
        f"Transcrição base:\n{transcription}",
    ]
    if template_prompt:
        sections.append(f"Modelo base:\n{template_prompt}")
    if custom_request:
        sections.append(f"Pedido do usuário:\n{custom_request}")
    if additional_instructions:
        sections.append(f"Instruções adicionais:\n{additional_instructions}")
    sections.append("Entregue em formato limpo, com títulos e subtítulos quando fizer sentido.")
    return "\n\n".join(sections)


def _generate_openai(prompt: str, api_key: str) -> tuple[str, TranscriptionEngine]:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=api_key, timeout=settings.provider_timeout_seconds)
    response = client.chat.completions.create(
        model=settings.openai_report_model,
        messages=[
            {"role": "system", "content": "Você gera relatórios claros, objetivos e bem estruturados."},
            {"role": "user", "content": prompt},
        ],
    )
    content = response.choices[0].message.content or ""
    if not content.strip():
        raise RuntimeError("OpenAI retornou relatório vazio")
    return content.strip(), TranscriptionEngine.OPENAI


def _generate_gemini(prompt: str, api_key: str) -> tuple[str, TranscriptionEngine]:
    from google import genai

    settings = get_settings()
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=settings.gemini_report_model, contents=prompt)
    content = getattr(response, "text", None) or ""
    if not content.strip():
        raise RuntimeError("Gemini retornou relatório vazio")
    return content.strip(), TranscriptionEngine.GEMINI


def _generate_local_fallback(title: str, transcription: str, custom_request: str | None) -> tuple[str, TranscriptionEngine]:
    excerpt = transcription[:3000].strip()
    content = (
        f"# {title}\n\n"
        "## Solicitação\n"
        f"{custom_request or 'Relatório baseado na transcrição.'}\n\n"
        "## Resumo inicial\n"
        f"{excerpt}\n"
    )
    return content, TranscriptionEngine.NONE


def generate_report(db: Session, payload: GenerateReportRequest) -> GeneratedReport:
    upload_repository = UploadRepository(db)
    template_repository = ReportTemplateRepository(db)
    report_repository = ReportRepository(db)
    upload = upload_repository.get(payload.upload_id)
    if not upload:
        raise ValueError("Upload não encontrado")
    if not upload.transcription_text:
        raise ValueError("A transcrição ainda não está disponível")

    template = template_repository.get(payload.template_id) if payload.template_id else None
    output_format = template.output_format if template else ReportFormat.MARKDOWN
    prompt = build_report_prompt(
        transcription=upload.transcription_text,
        template_prompt=template.base_prompt if template else None,
        custom_request=payload.custom_request,
        additional_instructions=payload.additional_instructions or (template.complementary_instructions if template else None),
    )

    upload.status = ProcessingStatus.GENERATING_REPORT
    upload_repository.save(upload)

    settings_data = get_effective_provider_settings(db)
    openai_key = settings_data.get("openai_api_key")
    gemini_key = settings_data.get("gemini_api_key")

    try:
        if isinstance(openai_key, str) and openai_key:
            content, engine = _generate_openai(prompt, openai_key)
        elif isinstance(gemini_key, str) and gemini_key:
            content, engine = _generate_gemini(prompt, gemini_key)
        else:
            content, engine = _generate_local_fallback(payload.title, upload.transcription_text, payload.custom_request)
    except Exception:
        if isinstance(gemini_key, str) and gemini_key:
            try:
                content, engine = _generate_gemini(prompt, gemini_key)
            except Exception:
                content, engine = _generate_local_fallback(payload.title, upload.transcription_text, payload.custom_request)
        else:
            content, engine = _generate_local_fallback(payload.title, upload.transcription_text, payload.custom_request)

    report = GeneratedReport(
        upload_id=upload.id,
        template_id=template.id if template else None,
        title=payload.title,
        request_prompt=prompt,
        content=content,
        output_format=output_format,
        generator_engine=engine,
    )
    created = report_repository.create(report)
    upload.report_count += 1
    upload.status = ProcessingStatus.COMPLETED
    upload_repository.save(upload)

    export_dir = Path(str(settings_data.get("export_directory") or get_settings().exports_dir))
    export_dir.mkdir(parents=True, exist_ok=True)
    suffix = ".md" if output_format == ReportFormat.MARKDOWN else ".txt"
    export_path = export_dir / f"{created.id}{suffix}"
    export_path.write_text(created.content, encoding="utf-8")

    return created
