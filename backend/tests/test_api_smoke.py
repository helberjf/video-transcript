from datetime import datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.api.routes import forms, history, report_templates, reports, settings, transcriptions, uploads
from app.core.database import get_db
from app.main import health_check
from app.schemas.report import ReportExportExtension


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _raise(exc: Exception):
    raise exc


def _upload_payload(upload_id: str = "upload-1") -> dict[str, object]:
    timestamp = _now_iso()
    return {
        "id": upload_id,
        "original_filename": "video.mp4",
        "stored_filename": "video.mp4",
        "file_type": "video",
        "mime_type": "video/mp4",
        "original_path": "storage/uploads/video.mp4",
        "converted_path": None,
        "transcription_text": "texto de teste",
        "transcription_engine": "openai",
        "language_detected": "pt-BR",
        "status": "completed",
        "upload_size_bytes": 2048,
        "duration_seconds": 12.3,
        "error_message": None,
        "report_count": 1,
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def _upload_namespace(upload_id: str = "upload-1") -> SimpleNamespace:
    return SimpleNamespace(**_upload_payload(upload_id))


def _report_payload(report_id: str = "report-1", upload_id: str = "upload-1") -> dict[str, object]:
    return {
        "id": report_id,
        "upload_id": upload_id,
        "template_id": "template-1",
        "title": "Relatório de teste",
        "request_prompt": "Prompt usado no relatório",
        "content": "# Relatório\n\nConteúdo gerado",
        "output_format": "markdown",
        "generator_engine": "openai",
        "created_at": _now_iso(),
    }


def _report_export_payload(report_id: str = "report-1", extension: str = "md") -> dict[str, object]:
    media_type = {
        "md": "text/markdown; charset=utf-8",
        "txt": "text/plain; charset=utf-8",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
    }[extension]
    return {
        "extension": extension,
        "filename": f"Relatorio.{extension}",
        "media_type": media_type,
        "size_bytes": 128,
        "download_url": f"/api/reports/{report_id}/exports/{extension}",
    }


def _form_fill_payload(template_id: str = "template-1") -> dict[str, object]:
    return {
        "template_id": template_id,
        "title": "Formulario preenchido",
        "content": "# Formulario\n\nCampo preenchido pela IA.",
        "output_format": "markdown",
        "generator_engine": "openai",
    }


def _template_payload(template_id: str = "template-1") -> dict[str, object]:
    timestamp = _now_iso()
    return {
        "id": template_id,
        "name": "Template padrão",
        "description": "Template para testes de API",
        "category": "Resumo",
        "base_prompt": "Gerar um relatório completo a partir da transcrição.",
        "example_output": "# Exemplo\n\nResumo do conteúdo.",
        "complementary_instructions": "Usar tom objetivo.",
        "form_fields": [
            {
                "key": "nome_cliente",
                "label": "Nome do cliente",
                "type": "text",
                "placeholder": None,
                "required": True,
                "help": None,
            }
        ],
        "output_format": "markdown",
        "is_favorite": True,
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def _settings_payload() -> dict[str, object]:
    return {
        "openai_api_key_masked": "sk-***123",
        "gemini_api_key_masked": None,
        "claude_api_key_masked": "cla***456",
        "default_report_template_id": "template-1",
        "whisper_model": "medium",
        "transcription_provider_order": ["openai", "gemini", "whisper"],
        "report_provider_order": ["openai", "claude", "gemini", "local"],
        "export_directory": "storage/exports",
        "preferred_language": "pt-BR",
        "max_upload_mb": 500,
        "auto_cleanup_temp_files": True,
        "updated_at": _now_iso(),
    }


def _dashboard_payload() -> dict[str, object]:
    return {
        "total_uploads": 1,
        "total_reports": 1,
        "most_used_engine": "openai",
        "recent_uploads": [_upload_payload()],
    }


class _FakeReportRepository:
    def __init__(self, db) -> None:
        self.db = db

    def get(self, report_id: str):
        return _report_payload(report_id=report_id)

    def list_by_upload(self, upload_id: str):
        return [_report_payload(upload_id=upload_id)]

    def save(self, report):
        return report


def _build_test_client(monkeypatch) -> TestClient:
    monkeypatch.setattr(history, "list_uploads", lambda db: [_upload_payload()])

    monkeypatch.setattr(settings, "read_settings", lambda db: _settings_payload())
    monkeypatch.setattr(settings, "update_settings", lambda db, payload: _settings_payload())

    monkeypatch.setattr(report_templates, "list_templates", lambda db: [_template_payload()])
    monkeypatch.setattr(report_templates, "get_template", lambda db, template_id: _template_payload(template_id))
    monkeypatch.setattr(report_templates, "create_template", lambda db, payload: _template_payload("template-created"))
    monkeypatch.setattr(
        report_templates,
        "analyze_template_reference",
        lambda db, file, **kwargs: {
            **_template_payload("template-preview"),
            "source_filename": file.filename,
            "source_format": "txt",
            "converted_docx_filename": None,
            "converted_docx_base64": None,
        },
    )
    monkeypatch.setattr(report_templates, "create_template_from_reference", lambda db, file, **kwargs: _template_payload("template-ai-created"))
    monkeypatch.setattr(report_templates, "update_template", lambda db, template_id, payload: _template_payload(template_id))
    monkeypatch.setattr(report_templates, "delete_template", lambda db, template_id: None)
    monkeypatch.setattr(report_templates, "duplicate_template", lambda db, template_id: _template_payload(f"{template_id}-copy"))

    monkeypatch.setattr(reports, "generate_report", lambda db, payload: _report_payload(report_id="report-generated", upload_id=payload.upload_id))
    monkeypatch.setattr(reports, "rename_report", lambda db, report_id, title: {**_report_payload(report_id=report_id), "title": title})
    monkeypatch.setattr(reports, "ReportRepository", _FakeReportRepository)
    monkeypatch.setattr(forms, "fill_form_from_text", lambda db, payload: _form_fill_payload(payload.template_id))

    monkeypatch.setattr(transcriptions, "get_upload_or_404", lambda db, upload_id: _upload_namespace(upload_id))

    monkeypatch.setattr(uploads, "create_upload", lambda db, file: _upload_namespace("upload-created"))
    monkeypatch.setattr(uploads, "create_upload_from_remote_url", lambda db, source, url: _upload_namespace(f"{source}-created"))
    monkeypatch.setattr(uploads, "list_uploads", lambda db: [_upload_payload()])
    monkeypatch.setattr(uploads, "get_upload_or_404", lambda db, upload_id: _upload_namespace(upload_id))
    monkeypatch.setattr(uploads, "delete_upload", lambda db, upload_id: None)
    monkeypatch.setattr(uploads, "read_dashboard_stats", lambda db: _dashboard_payload())
    monkeypatch.setattr(
        uploads,
        "process_upload",
        lambda upload_id, language, force_reprocess=False, use_api=True, whisper_model=None, transcription_provider=None: None,
    )

    app = FastAPI()
    app.include_router(api_router)
    app.get("/api/health")(health_check)
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    return TestClient(app)


def test_health_and_settings_endpoints(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    health_response = client.get("/api/health")
    assert health_response.status_code == 200
    assert health_response.json()["status"] == "ok"

    settings_response = client.get("/api/settings")
    assert settings_response.status_code == 200
    assert settings_response.json()["whisper_model"] == "medium"

    update_response = client.put(
        "/api/settings",
        json={
            "openai_api_key": "sk-test",
            "claude_api_key": "cl-test",
            "whisper_model": "small",
            "transcription_provider_order": ["gemini", "openai", "whisper"],
            "report_provider_order": ["claude", "openai", "gemini", "local"],
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["default_report_template_id"] == "template-1"
    assert update_response.json()["claude_api_key_masked"] == "cla***456"


def test_report_template_endpoints(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    list_response = client.get("/api/report-templates")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    get_response = client.get("/api/report-templates/template-1")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == "template-1"

    create_response = client.post(
        "/api/report-templates",
        json={
            "name": "Novo template",
            "description": "Template criado via teste",
            "category": "Resumo",
            "base_prompt": "Gerar um relatório bem estruturado com base na transcrição.",
            "example_output": "# Exemplo\n\nSaída esperada.",
            "complementary_instructions": "Usar linguagem simples.",
            "output_format": "markdown",
            "is_favorite": False,
        },
    )
    assert create_response.status_code == 200
    assert create_response.json()["id"] == "template-created"

    update_response = client.put("/api/report-templates/template-1", json={"name": "Template atualizado"})
    assert update_response.status_code == 200
    assert update_response.json()["id"] == "template-1"

    duplicate_response = client.post("/api/report-templates/template-1/duplicate")
    assert duplicate_response.status_code == 200
    assert duplicate_response.json()["id"] == "template-1-copy"

    analyze_response = client.post(
        "/api/report-templates/analyze-reference-preview",
        data={"name": "Modelo por IA"},
        files={"file": ("modelo.txt", b"Nome:\nData:\nResumo:", "text/plain")},
    )
    assert analyze_response.status_code == 200
    assert analyze_response.json()["source_filename"] == "modelo.txt"
    assert analyze_response.json()["form_fields"][0]["key"] == "nome_cliente"

    create_from_reference_response = client.post(
        "/api/report-templates/analyze-reference",
        data={"name": "Modelo por IA"},
        files={"file": ("modelo.txt", b"Nome:\nData:\nResumo:", "text/plain")},
    )
    assert create_from_reference_response.status_code == 200
    assert create_from_reference_response.json()["id"] == "template-ai-created"

    delete_response = client.delete("/api/report-templates/template-1")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"success": True}


def test_upload_and_transcription_endpoints(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    upload_response = client.post(
        "/api/uploads",
        files={"file": ("video.mp4", b"fake-bytes", "video/mp4")},
    )
    assert upload_response.status_code == 200
    assert upload_response.json()["id"] == "upload-created"

    import_response = client.post(
        "/api/uploads/import",
        json={"source": "youtube", "url": "https://youtu.be/demo123"},
    )
    assert import_response.status_code == 200
    assert import_response.json()["id"] == "youtube-created"

    list_response = client.get("/api/uploads")
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    detail_response = client.get("/api/uploads/upload-1")
    assert detail_response.status_code == 200
    assert detail_response.json()["original_filename"] == "video.mp4"

    process_response = client.post(
        "/api/process/upload-1",
        json={"language": "pt-BR", "force_reprocess": False, "use_api": False, "whisper_model": "small"},
    )
    assert process_response.status_code == 200
    assert process_response.json()["id"] == "upload-1"

    transcription_response = client.get("/api/transcriptions/upload-1")
    assert transcription_response.status_code == 200
    assert transcription_response.json()["transcription_text"] == "texto de teste"

    history_response = client.get("/api/history")
    assert history_response.status_code == 200
    assert len(history_response.json()) == 1

    dashboard_response = client.get("/api/dashboard/stats")
    assert dashboard_response.status_code == 200
    assert dashboard_response.json()["total_reports"] == 1

    delete_response = client.delete("/api/uploads/upload-1")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"success": True}


def test_report_endpoints(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    generate_response = client.post(
        "/api/reports/generate",
        json={
            "upload_id": "upload-1",
            "template_id": "template-1",
            "custom_request": "Resuma os pontos principais.",
            "additional_instructions": "Use bullet points.",
            "title": "Relatório final",
        },
    )
    assert generate_response.status_code == 200
    assert generate_response.json()["id"] == "report-generated"

    get_response = client.get("/api/reports/report-1")
    assert get_response.status_code == 200
    assert get_response.json()["title"] == "Relatório de teste"

    rename_response = client.patch("/api/reports/report-1", json={"title": "Título atualizado"})
    assert rename_response.status_code == 200
    assert rename_response.json()["title"] == "Título atualizado"

    list_response = client.get("/api/uploads/upload-1/reports")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_form_fill_endpoint(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    response = client.post(
        "/api/forms/fill",
        json={
            "template_id": "template-1",
            "source_text": "Cliente informou nome, data e observacoes.",
            "title": "Formulario preenchido",
            "additional_instructions": "Destaque campos incertos.",
        },
    )
    assert response.status_code == 200
    assert response.json()["template_id"] == "template-1"
    assert response.json()["content"].startswith("# Formulario")


def test_form_export_endpoint_handles_large_content(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    noisy_content = "\n\n".join(
        [
            "# Certidão de Penhora",
            "Linha com acentuação, símbolos e ruído de encoding: Poder Judiciário Justiça do Trabalho" + chr(0x01),
            *[
                f"Parágrafo {index}: veículo PSM-1E35, reclamante MARCELO ALVES DA SILVA, oficial ARTHUR BARCELLOS."
                for index in range(1, 40)
            ],
        ]
    )

    pdf_response = client.post(
        "/api/forms/export",
        json={
            "title": "Penhora preenchida por campos",
            "content": noisy_content,
            "extension": "pdf",
        },
    )
    assert pdf_response.status_code == 200
    assert "application/pdf" in pdf_response.headers["content-type"]
    assert len(pdf_response.content) > 1000

    docx_response = client.post(
        "/api/forms/export",
        json={
            "title": "Penhora preenchida por campos",
            "content": noisy_content,
            "extension": "docx",
        },
    )
    assert docx_response.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in docx_response.headers["content-type"]
    assert docx_response.content.startswith(b"PK")


def test_report_export_endpoints(monkeypatch, tmp_path) -> None:
    client = _build_test_client(monkeypatch)

    markdown_path = tmp_path / "report-1.md"
    markdown_path.write_text("# Relatorio", encoding="utf-8")
    pdf_path = tmp_path / "report-1.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake")

    monkeypatch.setattr(
        reports,
        "list_report_exports",
        lambda db, report_id: [
            SimpleNamespace(
                extension=ReportExportExtension.MD,
                filename="Relatorio.md",
                media_type="text/markdown; charset=utf-8",
                path=markdown_path,
            ),
            SimpleNamespace(
                extension=ReportExportExtension.PDF,
                filename="Relatorio.pdf",
                media_type="application/pdf",
                path=pdf_path,
            ),
        ],
    )

    list_response = client.get("/api/reports/report-1/exports")
    assert list_response.status_code == 200
    assert [item["extension"] for item in list_response.json()] == ["md", "pdf"]

    monkeypatch.setattr(
        reports,
        "get_report_export",
        lambda db, report_id, extension: SimpleNamespace(
            path=pdf_path,
            filename="Relatorio.pdf",
            media_type="application/pdf",
        ),
    )

    download_response = client.get("/api/reports/report-1/exports/pdf")
    assert download_response.status_code == 200
    assert download_response.content == b"%PDF-1.4 fake"
    assert "application/pdf" in download_response.headers["content-type"]
    assert "attachment" in download_response.headers["content-disposition"]


def test_report_template_error_endpoints(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    monkeypatch.setattr(report_templates, "get_template", lambda db, template_id: _raise(ValueError("Template nÃ£o encontrado")))
    get_response = client.get("/api/report-templates/missing-template")
    assert get_response.status_code == 404

    monkeypatch.setattr(report_templates, "create_template", lambda db, payload: _raise(ValueError("Nome obrigatÃ³rio")))
    create_response = client.post(
        "/api/report-templates",
        json={
            "name": "InvÃ¡lido",
            "description": "Template invÃ¡lido",
            "category": "Resumo",
            "base_prompt": "Prompt detalhado para validaÃ§Ã£o.",
            "example_output": "# Exemplo completo",
            "complementary_instructions": "Use uma estrutura objetiva.",
            "output_format": "markdown",
            "is_favorite": False,
        },
    )
    assert create_response.status_code == 400

    monkeypatch.setattr(report_templates, "update_template", lambda db, template_id, payload: _raise(ValueError("J\u00e1 existe")))
    update_response = client.put("/api/report-templates/template-1", json={"name": "Duplicado"})
    assert update_response.status_code == 400

    monkeypatch.setattr(report_templates, "delete_template", lambda db, template_id: _raise(ValueError("Template nÃ£o encontrado")))
    delete_response = client.delete("/api/report-templates/template-1")
    assert delete_response.status_code == 404

    monkeypatch.setattr(report_templates, "duplicate_template", lambda db, template_id: _raise(ValueError("Template nÃ£o encontrado")))
    duplicate_response = client.post("/api/report-templates/template-1/duplicate")
    assert duplicate_response.status_code == 404


def test_report_error_endpoints(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    monkeypatch.setattr(reports, "generate_report", lambda db, payload: _raise(ValueError("Upload nÃ£o encontrado")))
    generate_response = client.post(
        "/api/reports/generate",
        json={
            "upload_id": "missing-upload",
            "template_id": None,
            "custom_request": "Resuma os pontos principais.",
            "additional_instructions": None,
            "title": "RelatÃ³rio final",
        },
    )
    assert generate_response.status_code == 400

    class _MissingReportRepository(_FakeReportRepository):
        def get(self, report_id: str):
            return None

    monkeypatch.setattr(reports, "ReportRepository", _MissingReportRepository)
    get_response = client.get("/api/reports/report-missing")
    assert get_response.status_code == 404

    monkeypatch.setattr(reports, "rename_report", lambda db, report_id, title: _raise(ValueError("RelatÃ³rio nÃ£o encontrado")))
    rename_response = client.patch("/api/reports/report-1", json={"title": "Novo tÃ­tulo"})
    assert rename_response.status_code == 404

    monkeypatch.setattr(reports, "list_report_exports", lambda db, report_id: _raise(ValueError("RelatÃ³rio nÃ£o encontrado")))
    list_exports_response = client.get("/api/reports/report-missing/exports")
    assert list_exports_response.status_code == 404

    monkeypatch.setattr(reports, "get_report_export", lambda db, report_id, extension: _raise(ValueError("ExportaÃ§Ã£o nÃ£o encontrada")))
    download_response = client.get("/api/reports/report-1/exports/pdf")
    assert download_response.status_code == 404


def test_process_endpoint_validates_payload(monkeypatch) -> None:
    client = _build_test_client(monkeypatch)

    response = client.post(
        "/api/process/upload-1",
        json={
            "language": "pt-BR",
            "force_reprocess": False,
            "use_api": False,
            "whisper_model": "x",
        },
    )
    assert response.status_code == 422
