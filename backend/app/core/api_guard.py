"""Barreira unica para toda a API publicada na web.

Com BACKEND_AUTH_REQUIRED=true, qualquer chamada a /api precisa de:
- Origin de um site autorizado (CORS_ORIGINS). Navegadores sempre mandam Origin em chamadas
  entre sites; Postman/curl nao mandam por padrao, entao a chamada direta ja morre aqui.
- Token assinado e de vida curta (5 min) emitido pelo frontend so depois do login.
  Forjar o Origin no Postman nao basta: sem login nao ha token valido.

O workspace do token fica no contexto da requisicao para os servicos escolherem a chave de IA certa.
"""

import re

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.request_context import workspace_scope
from app.core.workspace import normalize_workspace_id


OPEN_PATHS = {"/api/health"}


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    settings = get_settings()
    if origin.rstrip("/") in {item.rstrip("/") for item in settings.cors_origin_list}:
        return True
    return bool(settings.cors_origin_regex and re.fullmatch(settings.cors_origin_regex, origin))


def _token_workspace(authorization: str | None) -> str | None:
    """Workspace de um token valido, ou None quando o token falta ou nao confere."""
    settings = get_settings()
    secret = settings.backend_auth_secret
    if not secret or not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1].strip(), secret, algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError:
        return None
    workspace_id = payload.get("workspaceId")
    return normalize_workspace_id(workspace_id) if isinstance(workspace_id, str) else None


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
            workspace_id = _token_workspace(request.headers.get("authorization"))
            if not workspace_id:
                return JSONResponse({"detail": "Acesso negado"}, status_code=401)
            with workspace_scope(workspace_id):
                return await call_next(request)
        return await call_next(request)
