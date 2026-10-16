"""Rate limit por workspace nas rotas que gastam IA, trocam chaves ou recebem arquivos.

So vale na web (BACKEND_AUTH_REQUIRED=true): no desktop existe um usuario so, com a propria chave.
O contador fica no banco porque na Vercel cada instancia teria o seu contador em memoria.
"""

import logging
import math
import random
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.workspace import get_workspace_id
from app.models.api_rate_limit import ApiRateLimit


logger = logging.getLogger(__name__)

# (limite, janela em segundos) por tipo de acao.
RATE_LIMITS: dict[str, tuple[int, int]] = {
    # Troca de chave de IA.
    "settings": (10, 10 * 60),
    # Chamadas de IA disparadas pela pessoa: relatorio, formulario, analise de modelo, perguntas.
    "ai": (60, 10 * 60),
    # Modo ao vivo: uma janela de audio a cada 6 s por fonte (~20/min).
    "live-transcribe": (60, 60),
    "live-suggest": (20, 60),
    # Upload, importacao e processamento de midia.
    "media": (30, 10 * 60),
    # Cookies e login em navegador controlado.
    "cookies": (10, 10 * 60),
}


def _now() -> datetime:
    return datetime.utcnow()


def consume(db: Session, key: str, limit: int, window_seconds: int) -> int | None:
    """Conta a chamada. Retorna os segundos ate liberar quando o limite estourou, senao None."""
    now = _now()
    expired_before = now - timedelta(seconds=window_seconds)
    table = ApiRateLimit.__table__
    insert = postgres_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    expired = table.c.window_start <= expired_before
    # UPSERT atomico: duas requisicoes simultaneas nao leem o mesmo contador.
    statement = (
        insert(table)
        .values(key=key, count=1, window_start=now)
        .on_conflict_do_update(
            index_elements=[table.c.key],
            set_={
                "count": case((expired, 1), else_=table.c.count + 1),
                "window_start": case((expired, now), else_=table.c.window_start),
            },
        )
        .returning(table.c.count, table.c.window_start)
    )
    count, window_start = db.execute(statement).one()
    if random.random() < 0.01:
        db.execute(delete(ApiRateLimit).where(ApiRateLimit.window_start < now - timedelta(days=1)))
    db.commit()

    if count <= limit:
        return None
    return max(1, math.ceil((window_start + timedelta(seconds=window_seconds) - now).total_seconds()))


def rate_limit(scope: str):
    """Dependencia para `dependencies=[...]` de uma rota."""
    limit, window_seconds = RATE_LIMITS[scope]

    def dependency(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> None:
        if not get_settings().backend_auth_required:
            return
        try:
            retry_after = consume(db, f"{scope}:{workspace_id}", limit, window_seconds)
        except SQLAlchemyError:
            # Sem banco a rota falha logo adiante; o limite nao deve ser o motivo.
            db.rollback()
            logger.exception("Contador de rate limit indisponivel")
            return
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Muitas requisicoes em pouco tempo. Aguarde um pouco e tente de novo.",
                headers={"Retry-After": str(retry_after)},
            )

    return Depends(dependency)
