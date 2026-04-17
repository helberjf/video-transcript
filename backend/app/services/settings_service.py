from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.system_config import SystemConfig
from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings import SettingsRead, SettingsUpdate


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 6:
        return "*" * len(value)
    return f"{value[:3]}{'*' * (len(value) - 6)}{value[-3:]}"


def get_or_create_system_config(db: Session) -> SystemConfig:
    settings = get_settings()
    repository = SettingsRepository(db)
    config = repository.get()
    if config:
        return config

    config = SystemConfig(
        id=1,
        whisper_model=settings.whisper_model,
        export_directory=str(settings.exports_dir),
        preferred_language=settings.default_language,
        max_upload_mb=settings.max_upload_mb,
        auto_cleanup_temp_files=settings.auto_cleanup_temp_files,
    )
    return repository.save(config)


def get_effective_provider_settings(db: Session) -> dict[str, str | int | bool | None]:
    app_settings = get_settings()
    system_config = get_or_create_system_config(db)
    return {
        "openai_api_key": system_config.openai_api_key or app_settings.openai_api_key,
        "gemini_api_key": system_config.gemini_api_key or app_settings.gemini_api_key,
        "whisper_model": system_config.whisper_model or app_settings.whisper_model,
        "preferred_language": system_config.preferred_language or app_settings.default_language,
        "max_upload_mb": system_config.max_upload_mb,
        "auto_cleanup_temp_files": system_config.auto_cleanup_temp_files,
        "export_directory": system_config.export_directory or str(app_settings.exports_dir),
        "default_report_template_id": system_config.default_report_template_id,
    }


def read_settings(db: Session) -> SettingsRead:
    config = get_or_create_system_config(db)
    return SettingsRead(
        openai_api_key_masked=mask_secret(config.openai_api_key),
        gemini_api_key_masked=mask_secret(config.gemini_api_key),
        default_report_template_id=config.default_report_template_id,
        whisper_model=config.whisper_model,
        export_directory=config.export_directory,
        preferred_language=config.preferred_language,
        max_upload_mb=config.max_upload_mb,
        auto_cleanup_temp_files=config.auto_cleanup_temp_files,
        updated_at=config.updated_at,
    )


def update_settings(db: Session, payload: SettingsUpdate) -> SettingsRead:
    repository = SettingsRepository(db)
    config = get_or_create_system_config(db)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)
    repository.save(config)
    return read_settings(db)
