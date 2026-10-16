from types import SimpleNamespace

import run_backend


def test_run_backend_uses_settings_for_host_and_port(monkeypatch) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(run_backend, "get_settings", lambda: SimpleNamespace(app_host="0.0.0.0", app_port=8010))
    monkeypatch.setattr(run_backend.sys, "argv", ["run_backend.py"])

    def fake_run(app_path: str, *, host: str, port: int, reload: bool) -> None:
        captured.update(app_path=app_path, host=host, port=port, reload=reload)

    monkeypatch.setattr(run_backend.uvicorn, "run", fake_run)

    run_backend.main()

    assert captured == {
        "app_path": "app.main:app",
        "host": "0.0.0.0",
        "port": 8010,
        "reload": False,
    }


def test_run_backend_enables_reload_flag(monkeypatch) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(run_backend, "get_settings", lambda: SimpleNamespace(app_host="127.0.0.1", app_port=8000))
    monkeypatch.setattr(run_backend.sys, "argv", ["run_backend.py", "--reload"])

    def fake_run(app_path: str, *, host: str, port: int, reload: bool) -> None:
        captured.update(app_path=app_path, host=host, port=port, reload=reload)

    monkeypatch.setattr(run_backend.uvicorn, "run", fake_run)

    run_backend.main()

    assert captured["reload"] is True
    assert captured["app_path"] == "app.main:app"

def test_startup_retries_when_another_instance_creates_the_same_table(monkeypatch) -> None:
    from sqlalchemy.exc import ProgrammingError

    import app.main as main

    calls = []

    def create_all(bind):
        calls.append(bind)
        if len(calls) == 1:
            raise ProgrammingError("CREATE TABLE workspace_cookies", {}, Exception("already exists"))

    monkeypatch.setattr(main.Base.metadata, "create_all", create_all)
    monkeypatch.setattr(main.time, "sleep", lambda _: None)

    main._create_tables()

    assert len(calls) == 2
