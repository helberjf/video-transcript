import io
import os

import pytest
from fastapi import UploadFile
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.models.workspace_cookies import WorkspaceCookies
from app.services import cookies_service
from tests.conftest import create_test_session


COOKIES = "# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tsegredo-da-conta-a\n"


@pytest.fixture()
def web(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "backend_auth_required", True)
    monkeypatch.setattr(settings, "ai_keys_encryption_key", "k" * 40)
    monkeypatch.setattr(settings, "temp_dir", tmp_path / "temp")
    session, engine = create_test_session(tmp_path)
    session.close()
    monkeypatch.setattr(cookies_service, "SessionLocal", sessionmaker(bind=engine))
    try:
        yield sessionmaker(bind=engine)
    finally:
        engine.dispose()


def _upload(text: str) -> UploadFile:
    return UploadFile(file=io.BytesIO(text.encode()), filename="cookies.txt")


def test_cookies_are_stored_encrypted_per_account(web) -> None:
    status = cookies_service.save_cookies_file(_upload(COOKIES), "conta-a")

    with web() as db:
        row = db.get(WorkspaceCookies, "conta-a")
    assert status.configured and status.has_instagram
    assert "segredo-da-conta-a" not in row.content
    assert cookies_service.read_cookies_status("conta-b").configured is False


def test_cookies_only_exist_as_a_file_during_the_download(web) -> None:
    cookies_service.save_cookies_file(_upload(COOKIES), "conta-a")

    with cookies_service.workspace_cookies_scope("conta-a"):
        path = cookies_service.scoped_cookies_file()
        assert path and "segredo-da-conta-a" in open(path, encoding="utf-8").read()

    assert not os.path.exists(path)
    assert cookies_service.scoped_cookies_file() is None


def test_other_account_never_gets_someone_else_cookies(web) -> None:
    cookies_service.save_cookies_file(_upload(COOKIES), "conta-a")

    with cookies_service.workspace_cookies_scope("conta-b"):
        assert cookies_service.scoped_cookies_file() is None


def test_deleting_removes_only_that_account(web) -> None:
    cookies_service.save_cookies_file(_upload(COOKIES), "conta-a")
    cookies_service.save_cookies_file(_upload(COOKIES), "conta-b")

    cookies_service.delete_cookies_file("conta-a")

    assert cookies_service.read_cookies_status("conta-a").configured is False
    assert cookies_service.read_cookies_status("conta-b").configured is True
