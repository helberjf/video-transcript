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
