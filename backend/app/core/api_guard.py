"""Barreira unica para toda a API publicada na web.

Com BACKEND_AUTH_REQUIRED=true, qualquer chamada a /api precisa de:
- Origin de um site autorizado (CORS_ORIGINS). Navegadores sempre mandam Origin em chamadas
  entre sites; Postman/curl nao mandam por padrao, entao a chamada direta ja morre aqui.
- Token assinado e de vida curta (5 min) emitido pelo frontend so depois da senha de acesso.
  Forjar o Origin no Postman nao basta: sem a senha nao ha token valido.
"""

import re

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings


OPEN_PATHS = {"/api/health"}


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    settings = get_settings()
    if origin.rstrip("/") in {item.rstrip("/") for item in settings.cors_origin_list}:
        return True
    return bool(settings.cors_origin_regex and re.fullmatch(settings.cors_origin_regex, origin))


def _token_valid(authorization: str | None) -> bool:
    settings = get_settings()
    secret = settings.backend_auth_secret
    if not secret or not authorization or not authorization.lower().startswith("bearer "):
        return False
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1].strip(), secret, algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError:
        return False
    return isinstance(payload.get("workspaceId"), str)


class ApiGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        path = request.url.path
        if (
            settings.backend_auth_required
            and path.startswith("/api")
            and path not in OPEN_PATHS
            and request.method != "OPTIONS"
        ):
            if not origin_allowed(request.headers.get("origin")):
                return JSONResponse({"detail": "Origem nao autorizada"}, status_code=403)
            if not _token_valid(request.headers.get("authorization")):
                return JSONResponse({"detail": "Acesso negado"}, status_code=401)
        return await call_next(request)
