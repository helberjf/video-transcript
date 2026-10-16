"""Workspace da requisicao atual, visivel para servicos que nao recebem o workspace por parametro.

O ApiGuardMiddleware preenche o valor a partir do token. Workers em segundo plano (threads) nao
herdam o contexto da requisicao, entao abrem o proprio escopo com `workspace_scope`.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar


current_workspace_id: ContextVar[str | None] = ContextVar("current_workspace_id", default=None)


@contextmanager
def workspace_scope(workspace_id: str | None) -> Iterator[None]:
    token = current_workspace_id.set(workspace_id)
    try:
        yield
    finally:
        current_workspace_id.reset(token)
