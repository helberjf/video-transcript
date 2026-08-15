import re
from collections.abc import Callable
from inspect import signature
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.services.usage_service import sync_workspace_plan


DEFAULT_WORKSPACE_ID = "local-workspace"
WORKSPACE_ID_PATTERN = re.compile(r"[^a-zA-Z0-9_.-]+")


def normalize_workspace_id(value: str | None) -> str:
    normalized = WORKSPACE_ID_PATTERN.sub("-", (value or DEFAULT_WORKSPACE_ID).strip())
    normalized = normalized.strip(".-_")[:80]
    return normalized or DEFAULT_WORKSPACE_ID


def _backend_secret() -> str | None:
    settings = get_settings()
    return settings.backend_auth_secret or ("modeloia-dev-backend-secret" if settings.app_env == "development" else None)


def _decode_workspace_from_authorization(authorization: str | None) -> tuple[str, str | None] | None:
    """Retorna (workspace_id, plano) do token emitido pelo frontend."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None

    secret = _backend_secret()
    if not secret:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="BACKEND_AUTH_SECRET nao configurado")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token do backend invalido") from exc

    workspace_id = payload.get("workspaceId")
    if not isinstance(workspace_id, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sem workspace")

    plan = payload.get("plan")
    return normalize_workspace_id(workspace_id), plan if isinstance(plan, str) else None


def get_workspace_id(
    db: Annotated[Session, Depends(get_db)],
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    settings = get_settings()
    decoded = _decode_workspace_from_authorization(authorization)
    if decoded:
        workspace_id, plan = decoded
        # O plano vive no banco do frontend (Prisma). Sem esta sincronia o
        # backend trataria todo mundo como trial, inclusive o admin.
        if plan:
            sync_workspace_plan(db, workspace_id, plan)
        return workspace_id

    if settings.backend_auth_required:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login necessario para acessar este workspace")

    return normalize_workspace_id(x_workspace_id)


def call_with_workspace(func: Callable, *args, workspace_id: str, **kwargs):
    parameters = signature(func).parameters
    if "workspace_id" in parameters:
        return func(*args, workspace_id=workspace_id, **kwargs)
    return func(*args, **kwargs)
