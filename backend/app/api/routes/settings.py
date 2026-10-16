from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import rate_limit
from app.core.workspace import call_with_workspace, get_workspace_id
from app.schemas.settings import SettingsRead, SettingsUpdate
from app.services.settings_service import read_settings, update_settings


router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings", response_model=SettingsRead)
def read_settings_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> SettingsRead:
    return call_with_workspace(read_settings, db, workspace_id=workspace_id)


@router.put("/settings", response_model=SettingsRead, dependencies=[rate_limit("settings")])
def update_settings_endpoint(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> SettingsRead:
    return call_with_workspace(update_settings, db, payload, workspace_id=workspace_id)
