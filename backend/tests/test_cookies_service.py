from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import cookies_service


def test_write_netscape_cookies_writes_valid_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(temp_dir=tmp_path)
    monkeypatch.setattr(cookies_service, "get_settings", lambda: settings)

    rows = [
        {
            "domain": ".instagram.com",
            "path": "/",
            "secure": True,
            "expires": 1893456000,
            "name": "sessionid",
            "value": "abc123",
        },
        {
            "domain": "instagram.com",
            "path": "/",
            "secure": False,
            "expires": 0,
            "name": "ds_user_id",
            "value": "42",
        },
        {"domain": "", "name": "ignored", "value": "x"},
        {"domain": ".instagram.com", "name": "", "value": "x"},
    ]

    status = cookies_service._write_netscape_cookies(rows)

    target = tmp_path / "cookies.txt"
    assert target.exists()
    text = target.read_text(encoding="utf-8")

    assert text.startswith("# Netscape HTTP Cookie File")

    data_lines = [line for line in text.splitlines() if line and not line.startswith("#")]
    assert len(data_lines) == 2

    fields_session = data_lines[0].split("\t")
    assert fields_session[0] == ".instagram.com"
    assert fields_session[1] == "TRUE"
    assert fields_session[3] == "TRUE"
    assert fields_session[4] == "1893456000"
    assert fields_session[5] == "sessionid"
    assert fields_session[6] == "abc123"

    fields_user = data_lines[1].split("\t")
    assert fields_user[0] == "instagram.com"
    assert fields_user[1] == "FALSE"
    assert fields_user[3] == "FALSE"
    assert fields_user[5] == "ds_user_id"

    assert status.configured is True
    assert status.has_instagram is True
    assert status.total_lines == 2
