import inspect

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models import DocumentModel, GeneratedReport, ReportTemplate, SystemConfig, Upload


def _load_models() -> None:
    _ = (DocumentModel, GeneratedReport, ReportTemplate, SystemConfig, Upload)


def pytest_configure() -> None:
    _load_models()
    if "app" in inspect.signature(httpx.Client.__init__).parameters:
        return

    original_init = httpx.Client.__init__

    def compatible_init(self, *args, app=None, **kwargs):
        return original_init(self, *args, **kwargs)

    httpx.Client.__init__ = compatible_init


def create_test_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = session_local()
    return session, engine
