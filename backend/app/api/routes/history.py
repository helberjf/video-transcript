from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.upload import UploadDetail
from app.services.upload_service import list_uploads


router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=list[UploadDetail])
def history_endpoint(db: Session = Depends(get_db)) -> list[UploadDetail]:
    return list_uploads(db)
