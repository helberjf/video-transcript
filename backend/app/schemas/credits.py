from datetime import datetime

from pydantic import BaseModel


class CreditCostRead(BaseModel):
    type: str
    label: str
    unit: str
    credits: int


class CreditUsageRead(BaseModel):
    type: str
    label: str
    credits: int
    created_at: datetime


class CreditStatusRead(BaseModel):
    enabled: bool
    used: int
    limit: int | None
    remaining: int | None
    # "desktop", "own_key" ou "plan" quando a conta nao tem teto mensal.
    unlimited_reason: str | None
    resets_at: datetime
    costs: list[CreditCostRead]
    recent: list[CreditUsageRead]
