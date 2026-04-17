from app.models.enums import FileType, ProcessingStatus, TranscriptionEngine
from app.models.upload import Upload
from app.schemas.report import GenerateReportRequest
from app.schemas.report_template import ReportTemplateCreate, ReportTemplateUpdate
from app.services import report_service
from app.services.report_service import generate_report
from app.services.report_template_service import create_template, delete_template, duplicate_template, list_templates, update_template
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


def test_generate_report_uses_local_fallback_when_no_provider_key(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
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
            "export_directory": str(tmp_path / "exports"),
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
