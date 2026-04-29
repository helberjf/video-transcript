from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


settings = get_settings()


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def run_startup_migrations() -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        report_template_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(report_templates)"))
        }
        if report_template_columns and "workspace_id" not in report_template_columns:
            connection.execute(text("ALTER TABLE report_templates ADD COLUMN workspace_id VARCHAR(80) DEFAULT 'local-workspace' NOT NULL"))
        if report_template_columns and "example_output" not in report_template_columns:
            connection.execute(text("ALTER TABLE report_templates ADD COLUMN example_output TEXT"))
        if report_template_columns and "form_fields" not in report_template_columns:
            connection.execute(text("ALTER TABLE report_templates ADD COLUMN form_fields TEXT"))

        upload_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(uploads)"))
        }
        if upload_columns and "workspace_id" not in upload_columns:
            connection.execute(text("ALTER TABLE uploads ADD COLUMN workspace_id VARCHAR(80) DEFAULT 'local-workspace' NOT NULL"))

        report_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(generated_reports)"))
        }
        if report_columns and "workspace_id" not in report_columns:
            connection.execute(text("ALTER TABLE generated_reports ADD COLUMN workspace_id VARCHAR(80) DEFAULT 'local-workspace' NOT NULL"))

        system_config_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(system_config)"))
        }
        if system_config_columns:
            if "claude_api_key" not in system_config_columns:
                connection.execute(text("ALTER TABLE system_config ADD COLUMN claude_api_key VARCHAR(255)"))
            if "transcription_provider_order" not in system_config_columns:
                connection.execute(
                    text("ALTER TABLE system_config ADD COLUMN transcription_provider_order VARCHAR(120) DEFAULT 'openai,gemini,whisper' NOT NULL")
                )
            if "report_provider_order" not in system_config_columns:
                connection.execute(
                    text("ALTER TABLE system_config ADD COLUMN report_provider_order VARCHAR(120) DEFAULT 'openai,claude,gemini,local' NOT NULL")
                )
            if "default_report_template_id" not in system_config_columns:
                connection.execute(text("ALTER TABLE system_config ADD COLUMN default_report_template_id VARCHAR(36)"))
            if "updated_at" not in system_config_columns:
                connection.execute(text("ALTER TABLE system_config ADD COLUMN updated_at DATETIME DEFAULT (datetime('now'))"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
