from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.commercial import UsageEvent, Workspace


PLAN_CREDIT_LIMITS: dict[str, int | None] = {
    "trial": 20,
    "pro": 200,
    "business": 800,
    "enterprise": None,
}


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc).replace(tzinfo=None)


def ensure_workspace(db: Session, workspace_id: str) -> Workspace:
    workspace = db.get(Workspace, workspace_id)
    if workspace:
        return workspace

    workspace = Workspace(
        id=workspace_id,
        client_name="Cliente local",
        owner_name="Operador local",
        owner_email="local@formreport.local",
        segment="Operacoes documentais",
        plan="trial",
        billing_status="trialing",
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def current_month_credits(db: Session, workspace_id: str) -> int:
    total = db.scalar(
        select(func.coalesce(func.sum(UsageEvent.credits), 0)).where(
            UsageEvent.workspace_id == workspace_id,
            UsageEvent.created_at >= _month_start(),
        )
    )
    return int(total or 0)


def consume_credits(
    db: Session,
    workspace_id: str,
    event_type: str,
    credits: int,
    *,
    idempotency_key: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    if credits <= 0:
        return
    if not hasattr(db, "get") or not hasattr(db, "add"):
        return

    ensure_workspace(db, workspace_id)

    if idempotency_key:
        existing = db.scalar(select(UsageEvent).where(UsageEvent.idempotency_key == idempotency_key))
        if existing:
            return

    workspace = ensure_workspace(db, workspace_id)
    limit = PLAN_CREDIT_LIMITS.get(workspace.plan, PLAN_CREDIT_LIMITS["trial"])
    used = current_month_credits(db, workspace_id)

    if limit is not None and used + credits > limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Limite mensal de creditos excedido ({used}/{limit}). Atualize o plano para continuar.",
        )

    db.add(
        UsageEvent(
            workspace_id=workspace_id,
            type=event_type,
            credits=credits,
            idempotency_key=idempotency_key,
            metadata_json=metadata,
        )
    )
    db.commit()


def audio_video_credits(duration_seconds: float | None) -> int:
    if not duration_seconds or duration_seconds <= 0:
        return 1
    return max(1, math.ceil(duration_seconds / 60))
