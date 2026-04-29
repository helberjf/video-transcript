import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BASE_DIR.parent


def _settings_env_files() -> tuple[Path, ...]:
    files: list[Path] = []
    config_dir = os.getenv("APP_CONFIG_DIR")
    if config_dir:
        config_path = Path(config_dir)
        files.extend([config_path / ".env", config_path / ".env.local"])

    files.extend([BASE_DIR / ".env", PROJECT_DIR / ".env"])
    return tuple(files)


class Settings(BaseSettings):
    app_name: str = "Local Media Transcript Studio"
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    database_url: str = f"sqlite:///{(PROJECT_DIR / 'data' / 'app.db').as_posix()}"
    storage_dir: Path = PROJECT_DIR / "storage"
    uploads_dir: Path = PROJECT_DIR / "storage" / "uploads"
    processed_dir: Path = PROJECT_DIR / "storage" / "processed"
    exports_dir: Path = PROJECT_DIR / "storage" / "exports"
    temp_dir: Path = PROJECT_DIR / "storage" / "temp"

    max_upload_mb: int = 500
    auto_cleanup_temp_files: bool = True
    default_language: str = "pt-BR"
    whisper_model: str = "medium"
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    claude_api_key: str | None = None
    openai_transcription_model: str = "gpt-4o-mini-transcribe"
    openai_report_model: str = "gpt-4.1-mini"
    gemini_transcription_model: str = "gemini-2.5-flash"
    gemini_report_model: str = "gemini-2.5-flash"
    claude_report_model: str = "claude-3-5-sonnet-latest"
    transcription_provider_order: str = "openai,gemini,whisper"
    report_provider_order: str = "openai,claude,gemini,local"
    provider_timeout_seconds: int = 120
    provider_retries: int = 2

    model_config = SettingsConfigDict(env_file=_settings_env_files(), env_file_encoding="utf-8", case_sensitive=False, extra="ignore")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    for path in [
        settings.storage_dir,
        settings.uploads_dir,
        settings.processed_dir,
        settings.exports_dir,
        settings.temp_dir,
        Path(settings.database_url.replace("sqlite:///", "")).parent,
    ]:
        path.mkdir(parents=True, exist_ok=True)
    return settings
