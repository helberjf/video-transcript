"""Abre um Chromium controlado para o usuario passar pela verificacao do site.

O YouTube bloqueia downloads anonimos com "confirme que voce nao e um robo" e o
Instagram exige sessao logada. Nos dois casos a saida e a mesma: abrir uma janela
real, deixar a pessoa resolver o desafio e guardar os cookies da sessao.
"""

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.schemas.cookies import BrowserLoginTarget, CookiesStatus, InstagramLoginState, InstagramLoginStatus
from app.services.cookies_service import merge_netscape_cookies, read_cookies_status


logger = logging.getLogger(__name__)

LOGIN_TIMEOUT_SECONDS = 5 * 60
POLL_INTERVAL_SECONDS = 1.0


@dataclass(frozen=True)
class TargetConfig:
    label: str
    url: str
    domain_keywords: tuple[str, ...]
    # Basta um dos conjuntos estar presente para considerar a sessao pronta.
    required_cookie_sets: tuple[frozenset[str], ...]
    waiting_message: str
    # No YouTube, so passar pela verificacao ja rende cookies uteis; entao fechar
    # a janela salva o que houver em vez de cancelar.
    save_on_close: bool


TARGETS: dict[BrowserLoginTarget, TargetConfig] = {
    "instagram": TargetConfig(
        label="Instagram",
        url="https://www.instagram.com/",
        domain_keywords=("instagram.com",),
        required_cookie_sets=(frozenset({"sessionid", "ds_user_id"}),),
        waiting_message="Faca login na janela aberta. O app captura os cookies automaticamente quando a sessao ficar ativa.",
        save_on_close=False,
    ),
    "youtube": TargetConfig(
        label="YouTube",
        url="https://www.youtube.com/",
        domain_keywords=("youtube.com", "google.com"),
        required_cookie_sets=(
            frozenset({"SID", "SAPISID"}),
            frozenset({"__Secure-3PSID"}),
            frozenset({"__Secure-1PSID"}),
        ),
        waiting_message=(
            "Na janela aberta, conclua a verificacao do YouTube (e faca login, se quiser). "
            "Os cookies sao capturados assim que a sessao ficar ativa; se preferir, feche a janela ao terminar."
        ),
        save_on_close=True,
    ),
}


class _LoginRunState:
    def __init__(self) -> None:
        self.state: InstagramLoginState = "idle"
        self.message: str | None = None
        self.cookies: CookiesStatus | None = None
        self.task: asyncio.Task | None = None
        self.cancel_requested: bool = False


_states: dict[BrowserLoginTarget, _LoginRunState] = {target: _LoginRunState() for target in TARGETS}


def _get_state(target: BrowserLoginTarget) -> _LoginRunState:
    if target not in _states:
        _states[target] = _LoginRunState()
    return _states[target]


def _set_state(
    target: BrowserLoginTarget,
    state: InstagramLoginState,
    message: str | None = None,
    cookies: CookiesStatus | None = None,
) -> None:
    run = _get_state(target)
    run.state = state
    run.message = message
    run.cookies = cookies


def get_login_status(target: BrowserLoginTarget = "instagram") -> InstagramLoginStatus:
    run = _get_state(target)
    return InstagramLoginStatus(state=run.state, message=run.message, cookies=run.cookies)


def _user_data_dir(target: BrowserLoginTarget) -> Path:
    path = Path(get_settings().temp_dir) / f"playwright-{target}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _has_required_cookies(config: TargetConfig, cookies: list[dict[str, Any]]) -> bool:
    names = {cookie.get("name") for cookie in cookies}
    return any(required.issubset(names) for required in config.required_cookie_sets)


def _relevant_cookies(config: TargetConfig, cookies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        cookie
        for cookie in cookies
        if any(keyword in (cookie.get("domain") or "").lower() for keyword in config.domain_keywords)
    ]


async def _run_login_flow(target: BrowserLoginTarget) -> None:
    config = TARGETS[target]
    run = _get_state(target)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        _set_state(
            target,
            "error",
            "Playwright nao esta instalado. Rode: pip install playwright && python -m playwright install chromium.",
        )
        return

    _set_state(target, "launching", "Abrindo navegador controlado...")

    try:
        async with async_playwright() as pw:
            try:
                context = await pw.chromium.launch_persistent_context(
                    user_data_dir=str(_user_data_dir(target)),
                    headless=False,
                    viewport={"width": 1024, "height": 768},
                    args=["--no-first-run", "--no-default-browser-check"],
                )
            except Exception as exc:
                logger.exception("Failed to launch Chromium")
                _set_state(
                    target,
                    "error",
                    f"Falha ao abrir o navegador. Rode: python -m playwright install chromium. Detalhe: {exc}",
                )
                return

            browser_closed = asyncio.Event()
            context.on("close", lambda *_: browser_closed.set())

            captured: list[dict[str, Any]] = []
            try:
                page = context.pages[0] if context.pages else await context.new_page()
                await page.goto(config.url, wait_until="domcontentloaded", timeout=30000)
                _set_state(target, "waiting_login", config.waiting_message)

                cookies: list[dict[str, Any]] = []
                deadline = asyncio.get_event_loop().time() + LOGIN_TIMEOUT_SECONDS

                while True:
                    if run.cancel_requested:
                        _set_state(target, "canceled", "Login cancelado pelo usuario.")
                        return
                    if browser_closed.is_set():
                        if config.save_on_close and cookies:
                            break
                        _set_state(target, "canceled", "Janela do navegador foi fechada antes de detectar o login.")
                        return
                    if asyncio.get_event_loop().time() >= deadline:
                        if config.save_on_close and cookies:
                            break
                        _set_state(target, "error", "Tempo esgotado aguardando o login (5 minutos).")
                        return

                    try:
                        cookies = _relevant_cookies(config, await context.cookies())
                    except Exception:
                        if config.save_on_close and captured:
                            cookies = captured
                            break
                        _set_state(target, "canceled", "Conexao com o navegador foi perdida.")
                        return

                    captured = cookies or captured
                    if _has_required_cookies(config, cookies):
                        break

                    await asyncio.sleep(POLL_INTERVAL_SECONDS)

                _set_state(target, "extracting", "Capturando cookies da sessao...")
                session_cookies = cookies or captured
            finally:
                try:
                    await context.close()
                except Exception:
                    pass

        if not session_cookies:
            _set_state(target, "error", f"Nenhum cookie do {config.label} foi encontrado na sessao.")
            return

        cookies_status = merge_netscape_cookies(session_cookies, config.domain_keywords)
        _set_state(target, "completed", f"Cookies do {config.label} salvos com sucesso.", cookies=cookies_status)
    except asyncio.CancelledError:
        _set_state(target, "canceled", "Login cancelado.")
        raise
    except Exception as exc:
        logger.exception("Browser login flow failed for %s", target)
        _set_state(target, "error", f"Falha inesperada no login: {exc}")
    finally:
        run.cancel_requested = False
        run.task = None


def start_login_flow(target: BrowserLoginTarget = "instagram") -> InstagramLoginStatus:
    run = _get_state(target)
    if run.task and not run.task.done():
        return get_login_status(target)

    run.cancel_requested = False
    run.cookies = None
    _set_state(target, "launching", "Iniciando...")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    run.task = loop.create_task(_run_login_flow(target))
    return get_login_status(target)


def cancel_login_flow(target: BrowserLoginTarget = "instagram") -> InstagramLoginStatus:
    run = _get_state(target)
    if run.task and not run.task.done():
        run.cancel_requested = True
        return get_login_status(target)
    if run.state in ("idle", "completed", "error", "canceled"):
        return get_login_status(target)
    _set_state(target, "canceled", "Nada para cancelar.")
    return get_login_status(target)


def reset_for_tests() -> None:
    """Used by tests to reset the global state. Do not call from production code."""
    for target in list(_states):
        _states[target] = _LoginRunState()


def latest_cookies_status() -> CookiesStatus:
    return read_cookies_status()
