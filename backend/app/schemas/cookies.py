from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CookiesStatus(BaseModel):
    configured: bool
    updated_at: datetime | None = None
    size_bytes: int = 0
    total_lines: int = 0
    has_instagram: bool = False
    has_youtube: bool = False


InstagramLoginState = Literal[
    "idle",
    "launching",
    "waiting_login",
    "extracting",
    "completed",
    "error",
    "canceled",
]


class InstagramLoginStatus(BaseModel):
    state: InstagramLoginState
    message: str | None = None
    cookies: CookiesStatus | None = None
