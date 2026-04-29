import re
from collections.abc import Callable
from inspect import signature
from typing import Annotated

from fastapi import Header


DEFAULT_WORKSPACE_ID = "local-workspace"
WORKSPACE_ID_PATTERN = re.compile(r"[^a-zA-Z0-9_.-]+")


def normalize_workspace_id(value: str | None) -> str:
    normalized = WORKSPACE_ID_PATTERN.sub("-", (value or DEFAULT_WORKSPACE_ID).strip())
    normalized = normalized.strip(".-_")[:80]
    return normalized or DEFAULT_WORKSPACE_ID


def get_workspace_id(x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None) -> str:
    return normalize_workspace_id(x_workspace_id)


def call_with_workspace(func: Callable, *args, workspace_id: str, **kwargs):
    parameters = signature(func).parameters
    if "workspace_id" in parameters:
        return func(*args, workspace_id=workspace_id, **kwargs)
    return func(*args, **kwargs)
