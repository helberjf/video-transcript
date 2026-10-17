from __future__ import annotations

import logging
import math
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.commercial import UsageEvent, Workspace
from app.services.ai_key_service import get_ai_key_access, uses_owner_keys


logger = logging.getLogger(__name__)

PLAN_CREDIT_LIMITS: dict[str, int | None] = {
    "trial": 20,
    "pro": 200,
    "business": 800,
    "enterprise": None,
}


@dataclass(frozen=True)
class CreditCost:
    credits: int
    label: str
    unit: str


# Preco de cada acao que chama a IA. 1 credito ~ 1 minuto de midia, 1 imagem ou 1 resposta da IA.
# Toda rota que gasta IA cobra por esta tabela; a tela Plano do frontend mostra a mesma lista.
CREDIT_COSTS: dict[str, CreditCost] = {
    # Audio/video: o 1o minuto e cobrado ao iniciar, o resto quando a duracao e conhecida.
    "media_processing_start": CreditCost(1, "Áudio/vídeo (1º minuto)", "por arquivo"),
    "media_processing_duration": CreditCost(1, "Áudio/vídeo", "por minuto"),
    "live_transcription": CreditCost(1, "Transcrição ao vivo", "por minuto com fala"),
    "live_suggestion": CreditCost(1, "Sugestão ao vivo", "por sugestão"),
    "meeting_image_analysis": CreditCost(1, "Captura de tela da reunião", "por imagem"),
    "meeting_insights": CreditCost(1, "Refazer resumo e checklist", "por pedido"),
    "meeting_question": CreditCost(1, "Pergunta sobre a reunião", "por pergunta"),
    "report_generation": CreditCost(1, "Relatório ou documento", "por documento"),
    "form_generation": CreditCost(1, "Formulário preenchido", "por formulário"),
    "form_field_detection": CreditCost(1, "Detectar campos do formulário", "por pedido"),
    "form_paper_reading": CreditCost(1, "Leitura de papel ou foto", "por arquivo enviado"),
    "template_reference_analysis": CreditCost(1, "Analisar modelo de referência", "por arquivo"),
    "template_reference_extract": CreditCost(1, "Extrair texto do modelo", "por arquivo"),
    "template_reference_create": CreditCost(1, "Criar modelo a partir de referência", "por arquivo"),
    "instagram_ocr": CreditCost(1, "Leitura de slide do Instagram", "por imagem"),
}

# Por que a conta nao tem teto mensal (None = tem teto).
UNLIMITED_DESKTOP = "desktop"
UNLIMITED_OWN_KEY = "own_key"
UNLIMITED_PLAN = "plan"


@dataclass(frozen=True)
class CreditStatus:
    used: int
    limit: int | None
    unlimited_reason: str | None

    @property
    def remaining(self) -> int | None:
        return None if self.limit is None else max(0, self.limit - self.used)


def _can_query(db: Session) -> bool:
    return hasattr(db, "get") and hasattr(db, "add")


def credit_cost(event_type: str, quantity: int = 1) -> int:
    return CREDIT_COSTS[event_type].credits * max(0, quantity)


def plan_credit_limit(plan: str | None) -> int | None:
    """Limite mensal do plano, ou None quando nao ha limite (desktop/enterprise)."""
    settings = get_settings()
    if not settings.credit_limits_enabled:
        return None

    if plan == "trial" or plan not in PLAN_CREDIT_LIMITS:
        return settings.trial_credit_limit
    return PLAN_CREDIT_LIMITS[plan]


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc).replace(tzinfo=None)


def next_month_start() -> datetime:
    start = _month_start()
    return start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)


def ensure_workspace(db: Session, workspace_id: str) -> Workspace:
    workspace = db.get(Workspace, workspace_id)
    if workspace:
        return workspace

    workspace = Workspace(
        id=workspace_id,
        client_name="Cliente local",
        owner_name="Operador local",
        owner_email="local@modeloia.local",
        segment="Operacoes documentais",
        plan="trial",
        billing_status="trialing",
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def sync_workspace_plan(db: Session, workspace_id: str, plan: str) -> None:
    """Replica no backend o plano que o frontend guarda no Prisma."""
    if plan not in PLAN_CREDIT_LIMITS:
        return
    if not _can_query(db):
        return

    workspace = ensure_workspace(db, workspace_id)
    if workspace.plan == plan:
        return

    workspace.plan = plan
    db.commit()


def current_month_credits(db: Session, workspace_id: str) -> int:
    total = db.scalar(
        select(func.coalesce(func.sum(UsageEvent.credits), 0)).where(
            UsageEvent.workspace_id == workspace_id,
            UsageEvent.created_at >= _month_start(),
        )
    )
    return int(total or 0)


def _workspace_limit(db: Session, workspace: Workspace) -> tuple[int | None, str | None]:
    settings = get_settings()
    if not settings.credit_limits_enabled:
        return None, UNLIMITED_DESKTOP
    # Na web, quem processa com a propria chave de IA paga o provedor direto: sem limite do plano.
    if settings.backend_auth_required and not uses_owner_keys(get_ai_key_access(db, workspace.id)):
        return None, UNLIMITED_OWN_KEY
    limit = plan_credit_limit(workspace.plan)
    return limit, (UNLIMITED_PLAN if limit is None else None)


def credit_status(db: Session, workspace_id: str) -> CreditStatus:
    workspace = ensure_workspace(db, workspace_id)
    limit, reason = _workspace_limit(db, workspace)
    return CreditStatus(used=current_month_credits(db, workspace_id), limit=limit, unlimited_reason=reason)


def recent_usage(db: Session, workspace_id: str, limit: int = 20) -> list[UsageEvent]:
    return list(
        db.scalars(
            select(UsageEvent)
            .where(UsageEvent.workspace_id == workspace_id, UsageEvent.created_at >= _month_start())
            .order_by(UsageEvent.created_at.desc())
            .limit(limit)
        )
    )


def ensure_credits_available(db: Session, workspace_id: str, credits: int) -> None:
    """Recusa com 402 quando o saldo do mes nao cobre `credits`. Nao registra nada."""
    if credits <= 0 or not _can_query(db):
        return

    current = credit_status(db, workspace_id)
    if current.limit is None or current.used + credits <= current.limit:
        return

    if credits > current.limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Esta acao precisa de {credits} creditos e o plano atual libera {current.limit} por mes. "
                "Envie um arquivo mais curto (ou menos arquivos) ou atualize o plano."
            ),
        )
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail=(
            f"Limite mensal de creditos excedido ({current.used}/{current.limit}). "
            f"Esta acao precisa de {credits}. Atualize o plano para continuar."
        ),
    )


def consume_credits(
    db: Session,
    workspace_id: str,
    event_type: str,
    credits: int,
    *,
    idempotency_key: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> bool:
    """Registra o gasto. Retorna False quando nada foi cobrado agora (zero ou chave ja usada)."""
    if credits <= 0:
        return False
    if not _can_query(db):
        return False

    ensure_workspace(db, workspace_id)

    if idempotency_key:
        existing = db.scalar(select(UsageEvent).where(UsageEvent.idempotency_key == idempotency_key))
        if existing:
            return False

    ensure_credits_available(db, workspace_id, credits)

    db.add(
        UsageEvent(
            workspace_id=workspace_id,
            type=event_type,
            credits=credits,
            idempotency_key=idempotency_key,
            metadata_json=metadata,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # Outra requisicao gravou a mesma chave ao mesmo tempo: ja esta cobrado.
        db.rollback()
        return False
    return True


def refund_credits(db: Session, idempotency_key: str) -> None:
    """Devolve o que foi cobrado com esta chave. Nunca falha: o erro original e o que importa."""
    if not _can_query(db):
        return

    def remove() -> None:
        db.execute(delete(UsageEvent).where(UsageEvent.idempotency_key == idempotency_key))
        db.commit()

    try:
        try:
            remove()
        except SQLAlchemyError:
            # A falha que motivou a devolucao pode ter deixado a transacao inutilizavel.
            db.rollback()
            remove()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Nao foi possivel devolver os creditos de %s", idempotency_key)


@contextmanager
def charge(
    db: Session,
    workspace_id: str,
    event_type: str,
    *,
    quantity: int = 1,
    idempotency_key: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Iterator[None]:
    """Cobra antes de chamar a IA e devolve os creditos se a chamada falhar.

    Sem saldo, levanta 402 antes de gastar qualquer coisa no provedor.
    """
    key = idempotency_key or f"{event_type}:{uuid4()}"
    charged = consume_credits(
        db,
        workspace_id,
        event_type,
        credit_cost(event_type, quantity),
        idempotency_key=key,
        metadata=metadata,
    )
    try:
        yield
    except Exception:
        if charged:
            refund_credits(db, key)
        raise


def audio_video_credits(duration_seconds: float | None) -> int:
    if not duration_seconds or duration_seconds <= 0:
        return 1
    return max(1, math.ceil(duration_seconds / 60))
