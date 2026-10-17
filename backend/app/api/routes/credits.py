from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.workspace import get_workspace_id
from app.schemas.credits import CreditCostRead, CreditStatusRead, CreditUsageRead
from app.services.usage_service import CREDIT_COSTS, credit_status, next_month_start, recent_usage


router = APIRouter(prefix="/api", tags=["credits"])


@router.get("/credits", response_model=CreditStatusRead)
def read_credits_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> CreditStatusRead:
    current = credit_status(db, workspace_id)
    return CreditStatusRead(
        enabled=get_settings().credit_limits_enabled,
        used=current.used,
        limit=current.limit,
        remaining=current.remaining,
        unlimited_reason=current.unlimited_reason,
        resets_at=next_month_start(),
        costs=[
            CreditCostRead(type=event_type, label=cost.label, unit=cost.unit, credits=cost.credits)
            for event_type, cost in CREDIT_COSTS.items()
        ],
        recent=[
            CreditUsageRead(
                type=event.type,
                label=CREDIT_COSTS[event.type].label if event.type in CREDIT_COSTS else event.type,
                credits=event.credits,
                created_at=event.created_at,
            )
            for event in recent_usage(db, workspace_id)
        ],
    )
