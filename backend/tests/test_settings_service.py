from app.schemas.settings import SettingsUpdate
from app.services import settings_service
from tests.conftest import create_test_session


def test_update_settings_syncs_env_file_and_effective_provider_settings(tmp_path, monkeypatch) -> None:
    session, engine = create_test_session(tmp_path)
    env_path = tmp_path / ".env"
    example_path = tmp_path / ".env.example"
    example_path.write_text(
        "OPENAI_API_KEY=\n"
        "GEMINI_API_KEY=\n"
        "CLAUDE_API_KEY=\n"
        "WHISPER_MODEL=medium\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_service, "_get_backend_env_path", lambda: env_path)
    monkeypatch.setattr(settings_service, "_get_backend_env_example_path", lambda: example_path)

    updated = settings_service.update_settings(
        session,
        SettingsUpdate(
            openai_api_key="sk-test-123456",
            gemini_api_key="gm-test-654321",
            claude_api_key="cl-test-789012",
            transcription_provider_order=["gemini", "openai", "whisper"],
            report_provider_order=["claude", "openai", "gemini", "local"],
        ),
    )

    env_content = env_path.read_text(encoding="utf-8")
    assert "OPENAI_API_KEY=sk-test-123456" in env_content
    assert "GEMINI_API_KEY=gm-test-654321" in env_content
    assert "CLAUDE_API_KEY=cl-test-789012" in env_content

    effective = settings_service.get_effective_provider_settings(session)
    assert effective["openai_api_key"] == "sk-test-123456"
    assert effective["gemini_api_key"] == "gm-test-654321"
    assert effective["claude_api_key"] == "cl-test-789012"
    assert effective["transcription_provider_order"] == ["gemini", "openai", "whisper"]
    assert effective["report_provider_order"] == ["claude", "openai", "gemini", "local"]
    assert updated.openai_api_key_masked is not None
    assert updated.gemini_api_key_masked is not None
    assert updated.claude_api_key_masked is not None

    session.close()
    engine.dispose()