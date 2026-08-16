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
    assert upload.source_type == "youtube"
    assert upload.source_url == "https://youtu.be/abc123"
    assert upload.upload_size_bytes == len(b"fake-video")
    assert created["upload"] is upload


def test_create_upload_from_remote_url_rejects_invalid_source_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(temp_dir=Path("."), uploads_dir=Path(".")))

    with pytest.raises(upload_service.HTTPException) as exc_info:
        upload_service.create_upload_from_remote_url(db=object(), source="instagram", url="https://youtube.com/watch?v=abc")

    assert exc_info.value.detail == "URL invalida para Instagram"


def test_build_ydl_options_for_youtube_uses_cookie_file_but_never_the_browser(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """O cookies.txt libera o bloqueio anonimo; ler do navegador quebra por DPAPI."""
    cookie_file = tmp_path / "cookies.txt"
    cookie_file.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(temp_dir=tmp_path / "app-temp"))
    monkeypatch.setenv("INSTAGRAM_COOKIES_FILE", str(cookie_file))
    monkeypatch.setenv("YTDLP_COOKIES_FROM_BROWSER", "chrome:Default")

    options = upload_service._build_ydl_options("youtube", "remote.%(ext)s")

    assert options["format"] == "ba[ext=m4a]/ba/b[ext=mp4]/b"
    assert set(options["js_runtimes"]) == set(upload_service.JS_RUNTIME_CANDIDATES)
    assert options["cookiefile"] == str(cookie_file)
    assert "cookiesfrombrowser" not in options


def test_build_ydl_options_for_youtube_without_cookie_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(temp_dir=tmp_path / "app-temp"))
    monkeypatch.delenv("INSTAGRAM_COOKIES_FILE", raising=False)
    monkeypatch.delenv("YTDLP_COOKIES_FILE", raising=False)
    monkeypatch.setenv("YTDLP_COOKIES_FROM_BROWSER", "chrome:Default")

    options = upload_service._build_ydl_options("youtube", "remote.%(ext)s")

    assert "cookiefile" not in options
    assert "cookiesfrombrowser" not in options


def test_youtube_bot_block_message_points_to_the_cookies_page() -> None:
    message = upload_service._remote_download_error_message(
        "youtube",
        RuntimeError("ERROR: [youtube] abc: Requested format is not available."),
    )

    assert "cookies.txt" in message
    assert "alguns minutos" in message


def test_js_runtime_can_be_pinned_by_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    node_binary = tmp_path / "node.exe"
    node_binary.write_bytes(b"")
    monkeypatch.setenv("YTDLP_JS_RUNTIME", f"node:{node_binary}")

    runtimes = upload_service._resolve_js_runtimes()

    assert runtimes["node"] == {"path": str(node_binary)}


def test_build_ydl_options_for_instagram_uses_configured_cookie_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cookie_file = tmp_path / "cookies.txt"
    cookie_file.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(temp_dir=tmp_path / "app-temp"))
    monkeypatch.setenv("INSTAGRAM_COOKIES_FILE", str(cookie_file))
    monkeypatch.setenv("YTDLP_COOKIES_FROM_BROWSER", "chrome:Default")

    options = upload_service._build_ydl_options("instagram", "remote.%(ext)s")

    assert options["cookiefile"] == str(cookie_file)
    assert "cookiesfrombrowser" not in options


def test_youtube_bot_block_retries_with_alternate_player_client_without_cookies(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Sem isolar o temp_dir, o cookies.txt real da maquina entra nas opcoes.
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(temp_dir=tmp_path / "app-temp"))
    monkeypatch.delenv("INSTAGRAM_COOKIES_FILE", raising=False)
    monkeypatch.delenv("YTDLP_COOKIES_FILE", raising=False)
    calls: list[dict[str, object]] = []

    class FakeYoutubeDL:
        def __init__(self, options) -> None:
            self.options = options
            calls.append(options)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url: str, download: bool = False):
            if len(calls) == 1:
                raise RuntimeError("certificate verify failed: unable to get local issuer certificate")
            if len(calls) == 2:
                raise RuntimeError("Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies")
            return {"id": "abc123", "title": "Video de teste"}

    monkeypatch.setitem(sys.modules, "yt_dlp", SimpleNamespace(YoutubeDL=FakeYoutubeDL))

    result = upload_service.extract_remote_info_with_ssl_fallback(
        "youtube",
        "https://youtu.be/abc123",
        upload_service._build_ydl_options("youtube", "remote.%(ext)s"),
        download=False,
    )

    assert result == {"id": "abc123", "title": "Video de teste"}
    assert len(calls) == 3
    assert calls[1]["nocheckcertificate"] is True
    assert calls[2]["nocheckcertificate"] is True
    assert calls[2]["extractor_args"] == {
        "youtube": {"player_client": [upload_service.YOUTUBE_FALLBACK_PLAYER_CLIENTS[0]]}
    }
    assert all("cookiefile" not in options for options in calls)
    assert all("cookiesfrombrowser" not in options for options in calls)


def test_youtube_forbidden_download_walks_through_every_player_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []
    cleanups: list[int] = []
    working_client = upload_service.YOUTUBE_FALLBACK_PLAYER_CLIENTS[2]

    class FakeYoutubeDL:
        def __init__(self, options) -> None:
            self.options = options
            calls.append(options)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url: str, download: bool = False):
            player_client = (self.options.get("extractor_args") or {}).get("youtube", {}).get("player_client")
            if player_client == [working_client]:
                return {"id": "abc123", "title": "Video de teste"}
            raise RuntimeError("unable to download video data: HTTP Error 403: Forbidden")

    monkeypatch.setitem(sys.modules, "yt_dlp", SimpleNamespace(YoutubeDL=FakeYoutubeDL))

    result = upload_service.extract_remote_info_with_ssl_fallback(
        "youtube",
        "https://youtu.be/abc123",
        upload_service._build_ydl_options("youtube", "remote.%(ext)s"),
        download=True,
        before_retry=lambda: cleanups.append(len(calls)),
    )

    assert result == {"id": "abc123", "title": "Video de teste"}
    assert [
        (options.get("extractor_args") or {}).get("youtube", {}).get("player_client") for options in calls
    ] == [None, *[[client] for client in upload_service.YOUTUBE_FALLBACK_PLAYER_CLIENTS[:3]]]
    assert cleanups == [1, 2, 3]


def test_youtube_forbidden_error_message_explains_next_steps() -> None:
    message = upload_service._remote_download_error_message(
        "youtube",
        RuntimeError("ERROR: unable to download video data: HTTP Error 403: Forbidden"),
    )

    assert "Cookies do Instagram" not in message
    assert "HTTP 403" in message
    assert "yt-dlp" in message


def test_youtube_login_error_message_does_not_request_instagram_cookies() -> None:
    message = upload_service._remote_download_error_message(
        "youtube",
        RuntimeError("Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies"),
    )

    assert "Cookies do Instagram" not in message
    assert "YouTube bloqueou o download anonimo" in message
