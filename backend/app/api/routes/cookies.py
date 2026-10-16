from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.core.rate_limit import rate_limit
from app.core.workspace import get_workspace_id
from app.schemas.cookies import BrowserLoginTarget, CookiesStatus, InstagramLoginStatus
from app.services.browser_login_service import (
    cancel_login_flow,
    get_login_status,
    start_login_flow,
)
from app.services.cookies_service import (
    delete_cookies_file,
    read_cookies_status,
    save_cookies_file,
)


router = APIRouter(prefix="/api", tags=["cookies"])


def _desktop_only() -> None:
    """O login em navegador controlado abre uma janela na maquina do servidor: so faz sentido no desktop."""
    if get_settings().backend_auth_required:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Na web, envie o arquivo cookies.txt exportado do seu navegador.",
        )


@router.get("/cookies", response_model=CookiesStatus)
def get_cookies_status_endpoint(workspace_id: str = Depends(get_workspace_id)) -> CookiesStatus:
    return read_cookies_status(workspace_id)


@router.post("/cookies", response_model=CookiesStatus, dependencies=[rate_limit("cookies")])
def upload_cookies_endpoint(
    file: UploadFile = File(...),
    workspace_id: str = Depends(get_workspace_id),
) -> CookiesStatus:
    return save_cookies_file(file, workspace_id)


@router.delete("/cookies", response_model=CookiesStatus)
def delete_cookies_endpoint(workspace_id: str = Depends(get_workspace_id)) -> CookiesStatus:
    return delete_cookies_file(workspace_id)


@router.post("/cookies/instagram-login", response_model=InstagramLoginStatus, dependencies=[Depends(_desktop_only), rate_limit("cookies")])
async def start_instagram_login_endpoint(_: str = Depends(get_workspace_id)) -> InstagramLoginStatus:
    return start_login_flow("instagram")


@router.get("/cookies/instagram-login", response_model=InstagramLoginStatus, dependencies=[Depends(_desktop_only)])
def get_instagram_login_endpoint(_: str = Depends(get_workspace_id)) -> InstagramLoginStatus:
    return get_login_status("instagram")


@router.delete("/cookies/instagram-login", response_model=InstagramLoginStatus, dependencies=[Depends(_desktop_only)])
def cancel_instagram_login_endpoint(_: str = Depends(get_workspace_id)) -> InstagramLoginStatus:
    return cancel_login_flow("instagram")


@router.post("/cookies/browser-login/{target}", response_model=InstagramLoginStatus, dependencies=[Depends(_desktop_only), rate_limit("cookies")])
async def start_browser_login_endpoint(
    target: BrowserLoginTarget,
    _: str = Depends(get_workspace_id),
) -> InstagramLoginStatus:
    return start_login_flow(target)


@router.get("/cookies/browser-login/{target}", response_model=InstagramLoginStatus, dependencies=[Depends(_desktop_only)])
def get_browser_login_endpoint(
    target: BrowserLoginTarget,
    _: str = Depends(get_workspace_id),
) -> InstagramLoginStatus:
    return get_login_status(target)


@router.delete("/cookies/browser-login/{target}", response_model=InstagramLoginStatus, dependencies=[Depends(_desktop_only)])
def cancel_browser_login_endpoint(
    target: BrowserLoginTarget,
    _: str = Depends(get_workspace_id),
) -> InstagramLoginStatus:
    return cancel_login_flow(target)
