from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import call_with_workspace, get_workspace_id
from app.schemas.upload import UploadDetail
from app.services.upload_service import list_uploads


router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=list[UploadDetail])
def history_endpoint(db: Session = Depends(get_db), workspace_id: str = Depends(get_workspace_id)) -> list[UploadDetail]:
    return call_with_workspace(list_uploads, db, workspace_id=workspace_id)
