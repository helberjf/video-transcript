import os
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import BASE_DIR, get_settings
from app.models.system_config import SystemConfig
from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings import SettingsRead, SettingsUpdate


DEFAULT_TRANSCRIPTION_PROVIDER_ORDER = ["openai", "gemini", "whisper"]
DEFAULT_REPORT_PROVIDER_ORDER = ["openai", "claude", "gemini", "local"]
ORDER_FIELDS = {
    "transcription_provider_order": DEFAULT_TRANSCRIPTION_PROVIDER_ORDER,
    "report_provider_order": DEFAULT_REPORT_PROVIDER_ORDER,
}

ENV_SYNC_FIELDS = {
    "openai_api_key": "OPENAI_API_KEY",
    "gemini_api_key": "GEMINI_API_KEY",
    "claude_api_key": "CLAUDE_API_KEY",
}


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 6:
        return "*" * len(value)
    return f"{value[:3]}{'*' * (len(value) - 6)}{value[-3:]}"


def _get_backend_env_path() -> Path:
    config_dir = os.getenv("APP_CONFIG_DIR")
    if config_dir:
        return Path(config_dir) / ".env"
    return BASE_DIR / ".env"


def _get_backend_env_example_path() -> Path:
    config_dir = os.getenv("APP_CONFIG_DIR")
    if config_dir:
        local_example = Path(config_dir) / ".env.example"
        if local_example.exists():
            return local_example
    return BASE_DIR / ".env.example"


def _ensure_backend_env_file(env_path: Path) -> None:
    if env_path.exists():
        return

    example_path = _get_backend_env_example_path()
    if example_path.exists():
        env_path.write_text(example_path.read_text(encoding="utf-8"), encoding="utf-8")
        return

    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text("", encoding="utf-8")


def _sync_env_values(update_data: dict[str, str | int | bool | None]) -> None:
    env_updates = {
        ENV_SYNC_FIELDS[field]: "" if value is None else str(value)
        for field, value in update_data.items()
        if field in ENV_SYNC_FIELDS
    }
    if not env_updates:
        return

    env_path = _get_backend_env_path()
    _ensure_backend_env_file(env_path)

    existing_lines = env_path.read_text(encoding="utf-8").splitlines()
    remaining = dict(env_updates)
    new_lines: list[str] = []

    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            new_lines.append(line)
            continue

        key, _, _ = line.partition("=")
        normalized_key = key.strip()
        if normalized_key not in env_updates:
            new_lines.append(line)
            continue

        new_lines.append(f"{normalized_key}={env_updates[normalized_key]}")
        remaining.pop(normalized_key, None)

    for key, value in remaining.items():
        new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    get_settings.cache_clear()


def _normalize_provider_order(value: str | list[str] | None, fallback: list[str]) -> list[str]:
    if isinstance(value, str):
        candidates = [item.strip().lower() for item in value.split(",")]
    elif isinstance(value, list):
        candidates = [str(item).strip().lower() for item in value]
    else:
        candidates = []

    normalized: list[str] = []
    for item in candidates:
        if item and item in fallback and item not in normalized:
            normalized.append(item)

    for item in fallback:
        if item not in normalized:
            normalized.append(item)

    return normalized


def _serialize_provider_order(value: list[str] | str | None, fallback: list[str]) -> str:
    return ",".join(_normalize_provider_order(value, fallback))


def get_or_create_system_config(db: Session) -> SystemConfig:
    settings = get_settings()
    repository = SettingsRepository(db)
    config = repository.get()
    if config:
        return config

    config = SystemConfig(
        id=1,
        whisper_model=settings.whisper_model,
        transcription_provider_order=_serialize_provider_order(settings.transcription_provider_order, DEFAULT_TRANSCRIPTION_PROVIDER_ORDER),
        report_provider_order=_serialize_provider_order(settings.report_provider_order, DEFAULT_REPORT_PROVIDER_ORDER),
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
        "claude_api_key": system_config.claude_api_key or app_settings.claude_api_key,
        "whisper_model": system_config.whisper_model or app_settings.whisper_model,
        "transcription_provider_order": _normalize_provider_order(
            system_config.transcription_provider_order or app_settings.transcription_provider_order,
            DEFAULT_TRANSCRIPTION_PROVIDER_ORDER,
        ),
        "report_provider_order": _normalize_provider_order(
            system_config.report_provider_order or app_settings.report_provider_order,
            DEFAULT_REPORT_PROVIDER_ORDER,
        ),
        "preferred_language": system_config.preferred_language or app_settings.default_language,
        "max_upload_mb": system_config.max_upload_mb,
        "auto_cleanup_temp_files": system_config.auto_cleanup_temp_files,
        "export_directory": system_config.export_directory or str(app_settings.exports_dir),
        "default_report_template_id": system_config.default_report_template_id,
    }


def read_settings(db: Session) -> SettingsRead:
    config = get_or_create_system_config(db)
    effective = get_effective_provider_settings(db)
    return SettingsRead(
        openai_api_key_masked=mask_secret(effective.get("openai_api_key") if isinstance(effective.get("openai_api_key"), str) else None),
        gemini_api_key_masked=mask_secret(effective.get("gemini_api_key") if isinstance(effective.get("gemini_api_key"), str) else None),
        claude_api_key_masked=mask_secret(effective.get("claude_api_key") if isinstance(effective.get("claude_api_key"), str) else None),
        default_report_template_id=config.default_report_template_id,
        whisper_model=str(effective.get("whisper_model") or config.whisper_model),
        transcription_provider_order=list(effective.get("transcription_provider_order") or DEFAULT_TRANSCRIPTION_PROVIDER_ORDER),
        report_provider_order=list(effective.get("report_provider_order") or DEFAULT_REPORT_PROVIDER_ORDER),
        export_directory=str(effective.get("export_directory") or config.export_directory or "") or None,
        preferred_language=str(effective.get("preferred_language") or config.preferred_language),
        max_upload_mb=int(effective.get("max_upload_mb") or config.max_upload_mb),
        auto_cleanup_temp_files=bool(effective.get("auto_cleanup_temp_files")),
        updated_at=config.updated_at,
    )


def update_settings(db: Session, payload: SettingsUpdate) -> SettingsRead:
    repository = SettingsRepository(db)
    config = get_or_create_system_config(db)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in ORDER_FIELDS:
            setattr(config, field, _serialize_provider_order(value if isinstance(value, list) else None, ORDER_FIELDS[field]))
            continue
        setattr(config, field, value)
    repository.save(config)
    _sync_env_values(update_data)
    return read_settings(db)
