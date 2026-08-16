from types import SimpleNamespace

import pytest

from app.services import browser_login_service, cookies_service


@pytest.fixture()
def temp_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    settings = SimpleNamespace(temp_dir=tmp_path)
    monkeypatch.setattr(cookies_service, "get_settings", lambda: settings)
    monkeypatch.setattr(browser_login_service, "get_settings", lambda: settings)
    return tmp_path


def cookie(domain: str, name: str, value: str = "x") -> dict:
    return {"domain": domain, "path": "/", "secure": True, "expires": 0, "name": name, "value": value}


def test_youtube_login_keeps_instagram_cookies(temp_dir) -> None:
    cookies_service._write_netscape_cookies([cookie(".instagram.com", "sessionid", "abc")])

    status = cookies_service.merge_netscape_cookies(
        [cookie(".youtube.com", "SID", "123"), cookie(".google.com", "SAPISID", "456")],
        ("youtube.com", "google.com"),
    )

    assert status.has_instagram is True
    assert status.has_youtube is True
    conteudo = (temp_dir / "cookies.txt").read_text(encoding="utf-8")
    assert "sessionid" in conteudo
    assert "SID" in conteudo


def test_new_login_replaces_only_its_own_domain(temp_dir) -> None:
    cookies_service.merge_netscape_cookies([cookie(".youtube.com", "SID", "antigo")], ("youtube.com", "google.com"))
    cookies_service.merge_netscape_cookies([cookie(".youtube.com", "SID", "novo")], ("youtube.com", "google.com"))

    conteudo = (temp_dir / "cookies.txt").read_text(encoding="utf-8")
    assert "novo" in conteudo
    assert "antigo" not in conteudo


def test_youtube_target_accepts_any_google_session_cookie_set() -> None:
    config = browser_login_service.TARGETS["youtube"]

    assert browser_login_service._has_required_cookies(config, [cookie(".youtube.com", "SID"), cookie(".youtube.com", "SAPISID")])
    assert browser_login_service._has_required_cookies(config, [cookie(".youtube.com", "__Secure-3PSID")])
    assert not browser_login_service._has_required_cookies(config, [cookie(".youtube.com", "VISITOR_INFO1_LIVE")])


def test_targets_track_state_independently() -> None:
    browser_login_service.reset_for_tests()
    browser_login_service._set_state("youtube", "waiting_login", "aguardando")

    assert browser_login_service.get_login_status("youtube").state == "waiting_login"
    assert browser_login_service.get_login_status("instagram").state == "idle"

    browser_login_service.reset_for_tests()


def test_relevant_cookies_filters_by_domain() -> None:
    config = browser_login_service.TARGETS["youtube"]
    cookies = [cookie(".youtube.com", "SID"), cookie(".instagram.com", "sessionid"), cookie(".google.com", "SAPISID")]

    nomes = {c["name"] for c in browser_login_service._relevant_cookies(config, cookies)}

    assert nomes == {"SID", "SAPISID"}
