import asyncio
import logging
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.schemas.cookies import CookiesStatus, InstagramLoginState, InstagramLoginStatus
from app.services.cookies_service import _write_netscape_cookies, read_cookies_status


logger = logging.getLogger(__name__)

LOGIN_TIMEOUT_SECONDS = 5 * 60
POLL_INTERVAL_SECONDS = 1.0
INSTAGRAM_URL = "https://www.instagram.com/"
REQUIRED_COOKIES = {"sessionid", "ds_user_id"}


class _LoginRunState:
    state: InstagramLoginState = "idle"
    message: str | None = None
    cookies: CookiesStatus | None = None
    task: asyncio.Task | None = None
    cancel_requested: bool = False


_state = _LoginRunState()


def _set_state(
    state: InstagramLoginState,
    message: str | None = None,
    cookies: CookiesStatus | None = None,
) -> None:
    _state.state = state
    _state.message = message
    _state.cookies = cookies


def get_login_status() -> InstagramLoginStatus:
    return InstagramLoginStatus(state=_state.state, message=_state.message, cookies=_state.cookies)


def _user_data_dir() -> Path:
    path = Path(get_settings().temp_dir) / "playwright-instagram"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def _run_login_flow() -> None:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        _set_state(
            "error",
            "Playwright nao esta instalado. Rode: pip install playwright && python -m playwright install chromium.",
        )
        return

    _set_state("launching", "Abrindo navegador controlado...")

    try:
        async with async_playwright() as pw:
            try:
                context = await pw.chromium.launch_persistent_context(
                    user_data_dir=str(_user_data_dir()),
                    headless=False,
                    viewport={"width": 1024, "height": 768},
                    args=["--no-first-run", "--no-default-browser-check"],
                )
            except Exception as exc:
                logger.exception("Failed to launch Chromium")
                _set_state(
                    "error",
                    f"Falha ao abrir o navegador. Rode: python -m playwright install chromium. Detalhe: {exc}",
                )
                return

            browser_closed = asyncio.Event()
            context.on("close", lambda *_: browser_closed.set())

            try:
                page = context.pages[0] if context.pages else await context.new_page()
                await page.goto(INSTAGRAM_URL, wait_until="domcontentloaded", timeout=30000)
                _set_state(
                    "waiting_login",
                    "Faca login na janela aberta. O app captura os cookies automaticamente quando a sessao ficar ativa.",
                )

                cookies: list[dict[str, Any]] = []
                deadline = asyncio.get_event_loop().time() + LOGIN_TIMEOUT_SECONDS

                while True:
                    if _state.cancel_requested:
                        _set_state("canceled", "Login cancelado pelo usuario.")
                        return
                    if browser_closed.is_set():
                        _set_state("canceled", "Janela do navegador foi fechada antes de detectar o login.")
                        return
                    if asyncio.get_event_loop().time() >= deadline:
                        _set_state("error", "Tempo esgotado aguardando o login (5 minutos).")
                        return

                    try:
                        cookies = await context.cookies(INSTAGRAM_URL)
                    except Exception:
                        _set_state("canceled", "Conexao com o navegador foi perdida.")
                        return

                    names = {c.get("name") for c in cookies}
                    if REQUIRED_COOKIES.issubset(names):
                        break

                    await asyncio.sleep(POLL_INTERVAL_SECONDS)

                _set_state("extracting", "Capturando cookies da sessao...")
                instagram_cookies = [
                    c for c in cookies if "instagram.com" in (c.get("domain") or "")
                ]
            finally:
                try:
                    await context.close()
                except Exception:
                    pass

        cookies_status = _write_netscape_cookies(instagram_cookies)
        _set_state("completed", "Cookies do Instagram salvos com sucesso.", cookies=cookies_status)
    except asyncio.CancelledError:
        _set_state("canceled", "Login cancelado.")
        raise
    except Exception as exc:
        logger.exception("Instagram login flow failed")
        _set_state("error", f"Falha inesperada no login: {exc}")
    finally:
        _state.cancel_requested = False
        _state.task = None


def start_login_flow() -> InstagramLoginStatus:
    if _state.task and not _state.task.done():
        return get_login_status()

    _state.cancel_requested = False
    _state.cookies = None
    _set_state("launching", "Iniciando...")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    _state.task = loop.create_task(_run_login_flow())
    return get_login_status()


def cancel_login_flow() -> InstagramLoginStatus:
    if _state.task and not _state.task.done():
        _state.cancel_requested = True
        return get_login_status()
    if _state.state in ("idle", "completed", "error", "canceled"):
        return get_login_status()
    _set_state("canceled", "Nada para cancelar.")
    return get_login_status()


def reset_for_tests() -> None:
    """Used by tests to reset the global state. Do not call from production code."""
    _state.state = "idle"
    _state.message = None
    _state.cookies = None
    _state.task = None
    _state.cancel_requested = False


def latest_cookies_status() -> CookiesStatus:
    return read_cookies_status()
