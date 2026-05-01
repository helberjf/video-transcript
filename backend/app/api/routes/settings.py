from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import get_workspace_id
from app.schemas.settings import SettingsRead, SettingsUpdate
from app.services.settings_service import read_settings, update_settings


router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings", response_model=SettingsRead)
def read_settings_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> SettingsRead:
    return read_settings(db)


@router.put("/settings", response_model=SettingsRead)
def update_settings_endpoint(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> SettingsRead:
    return update_settings(db, payload)
