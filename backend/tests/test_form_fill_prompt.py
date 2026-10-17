"""Preencher formulario com a IA montava o prompt com a assinatura antiga e caia em 500."""

import pytest

from app.models import ReportTemplate
from app.schemas.form import FormFillFieldsRequest, FormFillRequest
from app.services import form_service
from tests.conftest import create_test_session


@pytest.fixture()
def session_with_template(tmp_path, monkeypatch):
    # Sem chave de IA: o preenchimento cai no gerador local, sem rede.
    monkeypatch.setattr(form_service, "get_effective_provider_settings", lambda db: {"report_provider_order": ["local"]})
    session, engine = create_test_session(tmp_path)
    template = ReportTemplate(
        workspace_id="local-workspace",
        name="Ata simples",
        description="Ata de teste",
        category="ata",
        base_prompt="Monte uma ata objetiva com os dados recebidos.",
        example_output="# Ata\n\nCliente: {{cliente}}",
        form_fields=[{"key": "cliente", "label": "Cliente"}],
    )
    session.add(template)
    session.commit()
    try:
        yield session, template.id
    finally:
        session.close()
        engine.dispose()


def test_fill_form_from_text_builds_the_prompt_and_returns_content(session_with_template) -> None:
    session, template_id = session_with_template

    response = form_service.fill_form_from_text(
        session, FormFillRequest(template_id=template_id, source_text="Cliente Maria pediu revisao do contrato.")
    )

    assert response.template_id == template_id
    assert response.content.strip()


def test_fill_form_from_fields_with_ai_polish_builds_the_prompt(session_with_template) -> None:
    session, template_id = session_with_template

    response = form_service.fill_form_from_fields(
        session, FormFillFieldsRequest(template_id=template_id, fields={"cliente": "Maria"}, ai_polish=True)
    )

    assert response.content.strip()
