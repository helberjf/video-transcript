import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import forms
from app.core.database import get_db
from app.models.report_template import ReportTemplate
from app.services import paper_reading_service, report_template_service, vision_service
from tests.conftest import create_test_session


FIELDS = [
    {"key": "nome_completo", "label": "Nome completo", "type": "text"},
    {"key": "cpf", "label": "CPF", "type": "text"},
    {"key": "data_nascimento", "label": "Data de nascimento", "type": "date"},
    {"key": "endereco", "label": "Endereço", "type": "textarea"},
]

AI_ANSWER = """```json
{
  "transcricao": "Nome: Maria Aparecida Souza\\nCPF 123.456.789-00\\nnasc. 03/04/1985",
  "fields": {"nome_completo": "Maria Aparecida Souza", "cpf": "123.456.789-00", "data_nascimento": "03/04/1985", "campo_extra": "x"},
  "incertos": ["cpf", "chave_que_nao_existe"]
}
```"""


@pytest.fixture()
def setup(tmp_path, monkeypatch):
    session, engine = create_test_session(tmp_path)
    template = ReportTemplate(
        name="Declaração",
        description="Declaração de residência",
        category="documento",
        base_prompt="Preencha a declaração",
        example_output="Eu, {{nome_completo}}, CPF {{cpf}}, nascido(a) em {{data_nascimento}}, resido em {{endereco}}.",
        form_fields=FIELDS,
    )
    session.add(template)
    session.commit()

    calls: list[dict] = []

    def fake_vision(_db, prompt, files):
        calls.append({"prompt": prompt, "files": files})
        return AI_ANSWER, "gemini"

    monkeypatch.setattr(paper_reading_service, "read_with_vision", fake_vision)
    app = FastAPI()
    app.include_router(forms.router)
    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app), template, calls
    session.close()
    engine.dispose()


def test_photo_of_handwritten_paper_fills_the_template_fields(setup):
    client, template, calls = setup

    response = client.post(
        "/api/forms/read-paper",
        data={"template_id": template.id},
        files=[
            ("files", ("pagina1.jpg", b"\xff\xd8foto1", "image/jpeg")),
            ("files", ("pagina2.pdf", b"%PDF-scan", "application/octet-stream")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    # Todos os campos do modelo voltam, e so eles; o que nao estava no papel fica vazio.
    assert body["fields"] == {
        "nome_completo": "Maria Aparecida Souza",
        "cpf": "123.456.789-00",
        "data_nascimento": "03/04/1985",
        "endereco": "",
    }
    assert body["uncertain_fields"] == ["cpf"]
    assert "Maria Aparecida Souza" in body["transcription"]
    assert body["generator_engine"] == "gemini"
    # As duas paginas vao juntas para a IA, com o tipo certo mesmo quando o navegador nao informa.
    assert [item.mime_type for item in calls[0]["files"]] == ["image/jpeg", "application/pdf"]
    # A IA recebe a lista de campos do modelo para saber onde encaixar cada dado.
    assert all(f'"{field["key"]}"' in calls[0]["prompt"] for field in FIELDS)


def test_rejects_files_that_are_not_photos_or_pdfs(setup):
    client, template, _ = setup
    response = client.post(
        "/api/forms/read-paper",
        data={"template_id": template.id},
        files=[("files", ("planilha.xlsx", b"PK", "application/vnd.ms-excel"))],
    )
    assert response.status_code == 400


def test_template_without_fields_is_explained(setup):
    client, template, _ = setup
    template.form_fields = None
    response = client.post(
        "/api/forms/read-paper",
        data={"template_id": template.id},
        files=[("files", ("p.png", b"img", "image/png"))],
    )
    assert response.status_code == 400
    assert "campos" in response.json()["detail"]


def test_without_any_ai_key_the_message_says_where_to_configure(setup, monkeypatch):
    client, template, _ = setup
    monkeypatch.setattr(paper_reading_service, "read_with_vision", vision_service.read_with_vision)
    monkeypatch.setattr(vision_service, "get_effective_provider_settings", lambda _db: {"report_provider_order": ["gemini"]})
    response = client.post(
        "/api/forms/read-paper",
        data={"template_id": template.id},
        files=[("files", ("p.png", b"img", "image/png"))],
    )
    assert response.status_code == 502
    assert "Ajustes" in response.json()["detail"]


def test_vision_falls_back_to_the_next_provider(monkeypatch):
    monkeypatch.setattr(
        vision_service,
        "get_effective_provider_settings",
        lambda _db: {"report_provider_order": ["openai", "gemini"], "openai_api_key": "sk", "gemini_api_key": "g"},
    )

    def broken(*_args):
        raise RuntimeError("cota esgotada")

    monkeypatch.setitem(vision_service.PROVIDERS, "openai", broken)
    monkeypatch.setitem(vision_service.PROVIDERS, "gemini", lambda prompt, files, key: "lido pelo gemini")

    text, provider = vision_service.read_with_vision(None, "leia", [vision_service.VisionFile(b"x", "image/png")])

    assert (text, provider) == ("lido pelo gemini", "gemini")


def test_scanned_pdf_template_is_read_by_vision_instead_of_failing(tmp_path, monkeypatch):
    """PDF de modelo sem texto (escaneado) antes dava erro; agora vai para a IA de visao."""
    from io import BytesIO

    from pypdf import PdfWriter
    from starlette.datastructures import Headers, UploadFile

    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buffer)

    seen: dict = {}

    def fake_image_analysis(_db, prompt, data, content_type):
        seen["content_type"] = content_type
        return '{"name": "Modelo escaneado", "example_output": "Nome: {{nome}}", "form_fields": [{"key": "nome", "label": "Nome"}]}'

    monkeypatch.setattr(report_template_service, "_generate_reference_analysis_image", fake_image_analysis)
    upload = UploadFile(file=BytesIO(buffer.getvalue()), filename="modelo.pdf", headers=Headers({"content-type": "application/pdf"}))

    payload, *_ = report_template_service._analyze_reference_payload(None, upload)

    assert seen["content_type"] == "application/pdf"
    assert payload.form_fields[0].key == "nome"


def test_template_placeholders_are_aligned_with_field_keys():
    """Bug real do teste com a IA: {{data_nascimento_formatted}} ficava sem preencher."""
    from app.services.placeholders import reconcile_placeholders

    fields = [{"key": "data_nascimento", "label": "Data"}, {"key": "nome", "label": "Nome"}]
    text, reconciled = reconcile_placeholders(
        "Eu, {{Nome}}, nascido em {{data_nascimento_formatted}}, cidade {{Cidade Atual}}.", fields
    )

    assert text == "Eu, {{nome}}, nascido em {{data_nascimento}}, cidade {{cidade_atual}}."
    # Lacuna sem campo vira campo novo, para a pessoa conseguir preencher.
    assert [field["key"] for field in reconciled] == ["data_nascimento", "nome", "cidade_atual"]


def test_existing_templates_with_mismatched_placeholders_still_get_filled():
    from app.services.form_service import _substitute_placeholders

    filled = _substitute_placeholders(
        "Nascido em {{data_nascimento_declarante_formatted}} em {{local_assinatura}}.",
        {"data_nascimento_declarante": "03/04/1985", "local_assinatura": "Campinas"},
    )

    assert filled == "Nascido em 03/04/1985 em Campinas."
