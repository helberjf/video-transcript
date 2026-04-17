from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models import GeneratedReport, ReportTemplate, SystemConfig, Upload


def _load_models() -> None:
    _ = (GeneratedReport, ReportTemplate, SystemConfig, Upload)


def pytest_configure() -> None:
    _load_models()


def create_test_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = session_local()
    return session, engine
