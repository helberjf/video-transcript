import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.models.enums import FileType
from app.services import upload_service


def test_create_upload_from_remote_url_creates_upload_record(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir()
    settings = SimpleNamespace(
        uploads_dir=uploads_dir,
        temp_dir=tmp_path / "temp",
        max_upload_bytes=50 * 1024 * 1024,
        max_upload_mb=50,
    )
    settings.temp_dir.mkdir()

    created: dict[str, object] = {}

    class FakeRepository:
        def __init__(self, db) -> None:
            self.db = db

        def create(self, upload):
            created["upload"] = upload
            return upload

    class FakeYoutubeDL:
        def __init__(self, options) -> None:
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url: str, download: bool = False):
            assert download is True
            target = uploads_dir / "remote-deadbeef.mp4"
            target.write_bytes(b"fake-video")
            return {"title": "Video de teste"}

    monkeypatch.setattr(upload_service, "get_settings", lambda: settings)
    monkeypatch.setattr(upload_service, "UploadRepository", FakeRepository)
    monkeypatch.setattr(upload_service, "safe_unlink", lambda path: Path(path).unlink(missing_ok=True))
    monkeypatch.setattr(upload_service.os, "urandom", lambda _: bytes.fromhex("deadbeef"))
    monkeypatch.setitem(sys.modules, "yt_dlp", SimpleNamespace(YoutubeDL=FakeYoutubeDL))

    upload = upload_service.create_upload_from_remote_url(db=object(), source="youtube", url="https://youtu.be/abc123")

    assert upload.file_type == FileType.VIDEO
    assert upload.original_filename == "Video de teste.mp4"
    assert upload.stored_filename == "remote-deadbeef.mp4"
    assert upload.upload_size_bytes == len(b"fake-video")
    assert created["upload"] is upload


def test_create_upload_from_remote_url_rejects_invalid_source_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(temp_dir=Path("."), uploads_dir=Path(".")))

    with pytest.raises(upload_service.HTTPException) as exc_info:
        upload_service.create_upload_from_remote_url(db=object(), source="instagram", url="https://youtube.com/watch?v=abc")

    assert exc_info.value.detail == "URL invalida para Instagram"
