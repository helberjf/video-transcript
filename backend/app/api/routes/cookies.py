from fastapi import APIRouter, Depends, File, UploadFile

from app.core.workspace import get_workspace_id
from app.schemas.cookies import CookiesStatus, InstagramLoginStatus
from app.services.cookies_service import (
    delete_cookies_file,
    read_cookies_status,
    save_cookies_file,
)
from app.services.instagram_login_service import (
    cancel_login_flow,
    get_login_status,
    start_login_flow,
)


router = APIRouter(prefix="/api", tags=["cookies"])


@router.get("/cookies", response_model=CookiesStatus)
def get_cookies_status_endpoint(_: str = Depends(get_workspace_id)) -> CookiesStatus:
    return read_cookies_status()


@router.post("/cookies", response_model=CookiesStatus)
def upload_cookies_endpoint(
    file: UploadFile = File(...),
    _: str = Depends(get_workspace_id),
) -> CookiesStatus:
    return save_cookies_file(file)


@router.delete("/cookies", response_model=CookiesStatus)
def delete_cookies_endpoint(_: str = Depends(get_workspace_id)) -> CookiesStatus:
    return delete_cookies_file()


@router.post("/cookies/instagram-login", response_model=InstagramLoginStatus)
async def start_instagram_login_endpoint(_: str = Depends(get_workspace_id)) -> InstagramLoginStatus:
    return start_login_flow()


@router.get("/cookies/instagram-login", response_model=InstagramLoginStatus)
def get_instagram_login_endpoint(_: str = Depends(get_workspace_id)) -> InstagramLoginStatus:
    return get_login_status()


@router.delete("/cookies/instagram-login", response_model=InstagramLoginStatus)
def cancel_instagram_login_endpoint(_: str = Depends(get_workspace_id)) -> InstagramLoginStatus:
    return cancel_login_flow()
