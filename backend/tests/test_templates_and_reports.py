import pytest
import zipfile
from base64 import b64decode
from io import BytesIO
from starlette.datastructures import UploadFile

from app.models.enums import FileType, ProcessingStatus, TranscriptionEngine
from app.models.upload import Upload
from app.schemas.form import FormDetectFieldsRequest
from app.schemas.report import GenerateReportRequest, ReportExportExtension
from app.schemas.report_template import ReportTemplateCreate, ReportTemplateUpdate
from app.services import form_service, report_service, report_template_service
from app.services.form_service import detect_form_fields
from app.services.report_service import generate_report
from app.services.report_template_service import (
    analyze_template_reference,
    create_template,
    delete_template,
    duplicate_template,
    extract_template_reference_text,
    list_templates,
    update_template,
)
from tests.conftest import create_test_session


def test_template_crud_and_duplicate(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    template = create_template(
        session,
        ReportTemplateCreate(
            name="Ata teste",
            description="Modelo para atas",
            category="reuniao",
            base_prompt="Gere uma ata organizada a partir da transcrição.",
            example_output="# Ata\n\n## Decisões\n- Item",
            complementary_instructions="Use markdown.",
            output_format="markdown",
            is_favorite=True,
        ),
    )
    updated = update_template(session, template.id, ReportTemplateUpdate(description="Nova descrição"))
    duplicate = duplicate_template(session, template.id)
    listed = list_templates(session)

    assert updated.description == "Nova descrição"
    assert duplicate.name.endswith("(cópia)")
    assert duplicate.example_output == template.example_output
    assert len(listed) == 2

    delete_template(session, template.id)
    assert len(list_templates(session)) == 1

    session.close()
    engine.dispose()


def test_analyze_template_reference_reads_odt_fields(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    monkeypatch.setattr(report_template_service, "get_effective_provider_settings", lambda db: {"report_provider_order": ["local"]})

    content_xml = """<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:text>
    <text:p>Cliente: {{nome_cliente}}</text:p>
    <text:p>Data: {{data_atendimento}}</text:p>
  </office:text></office:body>
</office:document-content>"""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("content.xml", content_xml)
    buffer.seek(0)

    analysis = analyze_template_reference(
        session,
        UploadFile(file=buffer, filename="modelo.odt"),
        name="Modelo ODT",
    )

    assert analysis.source_format == "odt"
    assert [field.key for field in analysis.form_fields or []] == ["nome_cliente", "data_atendimento"]

    session.close()
    engine.dispose()


def test_extract_template_reference_text_reads_plain_document() -> None:
    buffer = BytesIO("Cliente: Maria\nValor: 1200".encode("utf-8"))

    extracted = extract_template_reference_text(UploadFile(file=buffer, filename="modelo.txt"))

    assert extracted.source_filename == "modelo.txt"
    assert extracted.source_format == "txt"
    assert "Cliente: Maria" in extracted.content


def test_analyze_template_reference_converts_pdf_to_docx_payload(tmp_path, monkeypatch) -> None:
    from reportlab.pdfgen import canvas

    session, engine = create_test_session(tmp_path)
    monkeypatch.setattr(report_template_service, "get_effective_provider_settings", lambda db: {"report_provider_order": ["local"]})

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.drawString(72, 720, "Cliente: {{nome_cliente}}")
    pdf.save()
    buffer.seek(0)

    analysis = analyze_template_reference(
        session,
        UploadFile(file=buffer, filename="modelo.pdf"),
        name="Modelo PDF",
    )

    assert analysis.source_format == "pdf"
    assert analysis.converted_docx_filename == "modelo-convertido.docx"
    assert b64decode(analysis.converted_docx_base64 or b"").startswith(b"PK")

    session.close()
    engine.dispose()


def test_detect_form_fields_uses_local_line_fallback(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    monkeypatch.setattr(form_service, "get_effective_provider_settings", lambda db: {"report_provider_order": ["local"]})

    template = create_template(
        session,
        ReportTemplateCreate(
            name="Contrato simples",
            description="Campos de contrato",
            category="contrato",
            base_prompt="Preencha o contrato.",
            example_output="Cliente: {{nome_cliente}}\nValor: {{valor}}",
            form_fields=[
                {"key": "nome_cliente", "label": "Nome do cliente", "type": "text", "required": True},
                {"key": "valor", "label": "Valor", "type": "number", "required": False},
            ],
            output_format="markdown",
            is_favorite=False,
        ),
    )

    result = detect_form_fields(
        session,
        FormDetectFieldsRequest(
            template_id=template.id,
            source_text="Nome do cliente: Maria Silva\nValor: 1200\nObservacoes: pagamento mensal.",
        ),
    )

    assert result.generator_engine == TranscriptionEngine.NONE
    assert result.fields["nome_cliente"] == "Maria Silva"
    assert result.fields["valor"] == "1200"

    session.close()
    engine.dispose()


def test_detect_form_fields_uses_ai_json_response(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    monkeypatch.setattr(
        form_service,
        "get_effective_provider_settings",
        lambda db: {"openai_api_key": "sk-test", "report_provider_order": ["openai", "local"]},
    )
    monkeypatch.setattr(
        form_service,
        "_generate_openai",
        lambda prompt, api_key: ('{"nome_cliente": "Ana Costa", "valor": "900"}', TranscriptionEngine.OPENAI),
    )

    template = create_template(
        session,
        ReportTemplateCreate(
            name="Proposta simples",
            description="Campos de proposta",
            category="proposta",
            base_prompt="Preencha a proposta.",
            example_output="Cliente: {{nome_cliente}}\nValor: {{valor}}",
            form_fields=[
                {"key": "nome_cliente", "label": "Nome do cliente", "type": "text", "required": True},
                {"key": "valor", "label": "Valor", "type": "number", "required": False},
            ],
            output_format="markdown",
            is_favorite=False,
        ),
    )

    result = detect_form_fields(
        session,
        FormDetectFieldsRequest(
            template_id=template.id,
            source_text="Cliente citado no audio: Ana Costa. Valor aprovado: 900.",
        ),
    )

    assert result.generator_engine == TranscriptionEngine.OPENAI
    assert result.fields == {"nome_cliente": "Ana Costa", "valor": "900"}

    session.close()
    engine.dispose()


def test_generate_report_uses_local_fallback_when_no_provider_key(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    export_dir = tmp_path / "exports"
    upload = Upload(
        original_filename="audio.mp3",
        stored_filename="audio.mp3",
        file_type=FileType.AUDIO,
        mime_type="audio/mpeg",
        original_path=str(tmp_path / "audio.mp3"),
        upload_size_bytes=10,
        transcription_text="Conteúdo transcrito para gerar relatório.",
        transcription_engine=TranscriptionEngine.WHISPER,
        status=ProcessingStatus.COMPLETED,
    )
    session.add(upload)
    session.commit()
    session.refresh(upload)

    monkeypatch.setattr(
        report_service,
        "get_effective_provider_settings",
        lambda db: {
            "openai_api_key": None,
            "gemini_api_key": None,
            "export_directory": str(export_dir),
        },
    )

    report = generate_report(
        session,
        GenerateReportRequest(
            upload_id=upload.id,
            template_id=None,
            custom_request="Gere um resumo executivo.",
            additional_instructions=None,
            title="Resumo local",
        ),
    )

    assert report.generator_engine == TranscriptionEngine.NONE
    assert "Resumo local" in report.content
    assert (export_dir / f"{report.id}.md").exists()
    assert (export_dir / f"{report.id}.docx").exists()
    assert (export_dir / f"{report.id}.pdf").exists()
    assert (export_dir / f"{report.id}.pdf").stat().st_size > 0

    session.close()
    engine.dispose()


def test_generated_report_exports_can_be_listed_and_downloaded(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    export_dir = tmp_path / "exports"
    upload = Upload(
        original_filename="audio.mp3",
        stored_filename="audio.mp3",
        file_type=FileType.AUDIO,
        mime_type="audio/mpeg",
        original_path=str(tmp_path / "audio.mp3"),
        upload_size_bytes=10,
        transcription_text="ConteÃºdo transcrito para gerar relatÃ³rio.",
        transcription_engine=TranscriptionEngine.WHISPER,
        status=ProcessingStatus.COMPLETED,
    )
    session.add(upload)
    session.commit()
    session.refresh(upload)

    monkeypatch.setattr(
        report_service,
        "get_effective_provider_settings",
        lambda db: {
            "openai_api_key": None,
            "gemini_api_key": None,
            "export_directory": str(export_dir),
        },
    )

    report = generate_report(
        session,
        GenerateReportRequest(
            upload_id=upload.id,
            template_id=None,
            custom_request="Gere um resumo executivo.",
            additional_instructions=None,
            title="Resumo local",
        ),
    )

    export_files = report_service.list_report_exports(session, report.id)
    assert [export_file.extension for export_file in export_files] == [
        ReportExportExtension.MD,
        ReportExportExtension.DOCX,
        ReportExportExtension.PDF,
    ]
    assert export_files[0].filename == "Resumo local.md"

    pdf_export = report_service.get_report_export(session, report.id, ReportExportExtension.PDF)
    assert pdf_export.path.exists()
    assert pdf_export.media_type == "application/pdf"

    with pytest.raises(ValueError):
        report_service.get_report_export(session, report.id, ReportExportExtension.TXT)

    session.close()
    engine.dispose()


def test_generate_report_prompt_uses_template_example(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    upload = Upload(
        original_filename="audio.mp3",
        stored_filename="audio.mp3",
        file_type=FileType.AUDIO,
        mime_type="audio/mpeg",
        original_path=str(tmp_path / "audio.mp3"),
        upload_size_bytes=10,
        transcription_text="João abriu a reunião e definiu prazo para sexta-feira.",
        transcription_engine=TranscriptionEngine.WHISPER,
        status=ProcessingStatus.COMPLETED,
    )
    session.add(upload)
    session.commit()
    session.refresh(upload)

    template = create_template(
        session,
        ReportTemplateCreate(
            name="Modelo estruturado",
            description="Segue um esqueleto fixo",
            category="reuniao",
            base_prompt="Preencha o modelo com base na transcrição.",
            example_output="# Relatório\n\n## Responsável\n- Nome\n\n## Prazo\n- Data",
            complementary_instructions="Se faltar dado, marque como não informado.",
            output_format="markdown",
            is_favorite=False,
        ),
    )

    monkeypatch.setattr(
        report_service,
        "get_effective_provider_settings",
        lambda db: {
            "openai_api_key": "sk-test",
            "gemini_api_key": None,
            "export_directory": str(tmp_path / "exports"),
        },
    )

    captured = {}

    def fake_generate_openai(prompt: str, api_key: str):
        captured["prompt"] = prompt
        return "# Relatório\n\n## Responsável\n- João", TranscriptionEngine.OPENAI

    monkeypatch.setattr(report_service, "_generate_openai", fake_generate_openai)

    report = generate_report(
        session,
        GenerateReportRequest(
            upload_id=upload.id,
            template_id=template.id,
            custom_request="Mantenha a estrutura.",
            additional_instructions=None,
            title="Relatório preenchido",
        ),
    )

    assert report.generator_engine == TranscriptionEngine.OPENAI
    assert "Modelo de referência" in captured["prompt"]
    assert "## Responsável" in captured["prompt"]
    assert "Não informado na transcrição" in captured["prompt"]

    session.close()
    engine.dispose()


def test_generate_report_can_prioritize_claude_and_rename(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    upload = Upload(
        original_filename="audio.mp3",
        stored_filename="audio.mp3",
        file_type=FileType.AUDIO,
        mime_type="audio/mpeg",
        original_path=str(tmp_path / "audio.mp3"),
        upload_size_bytes=10,
        transcription_text="Conteúdo transcrito para relatório com Claude.",
        transcription_engine=TranscriptionEngine.WHISPER,
        status=ProcessingStatus.COMPLETED,
    )
    session.add(upload)
    session.commit()
    session.refresh(upload)

    monkeypatch.setattr(
        report_service,
        "get_effective_provider_settings",
        lambda db: {
            "openai_api_key": "sk-test",
            "gemini_api_key": "gm-test",
            "claude_api_key": "cl-test",
            "report_provider_order": ["claude", "openai", "gemini", "local"],
            "export_directory": str(tmp_path / "exports"),
        },
    )
    monkeypatch.setattr(
        report_service,
        "_generate_claude",
        lambda prompt, api_key: ("# Relatório\n\nGerado pelo Claude", TranscriptionEngine.CLAUDE),
    )

    report = generate_report(
        session,
        GenerateReportRequest(
            upload_id=upload.id,
            template_id=None,
            custom_request="Use Claude primeiro.",
            additional_instructions=None,
            title="Relatório Claude",
        ),
    )

    assert report.generator_engine == TranscriptionEngine.CLAUDE

    renamed = report_service.rename_report(session, report.id, "Título atualizado")
    assert renamed.title == "Título atualizado"

    session.close()
    engine.dispose()
