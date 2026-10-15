from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.workspace import get_workspace_id
from app.services.live_service import MAX_WINDOW_BYTES, suggest_reply, transcribe_window


router = APIRouter(prefix="/api/live", tags=["live"])


class LiveTranscriptLine(BaseModel):
    speaker: str = Field(max_length=80)
    text: str = Field(max_length=4000)


class LiveSuggestRequest(BaseModel):
    lines: list[LiveTranscriptLine] = Field(default_factory=list, max_length=400)
    context: str | None = Field(default=None, max_length=8000)
    focus: str | None = Field(default=None, max_length=500)


@router.post("/transcribe")
def live_transcribe_endpoint(
    audio: UploadFile = File(...),
    language: str | None = Form(None),
    prompt: str | None = Form(None),
    db: Session = Depends(get_db),
    _workspace_id: str = Depends(get_workspace_id),
) -> dict[str, str]:
    data = audio.file.read(MAX_WINDOW_BYTES + 1)
    text, engine = transcribe_window(db, data, language, prompt)
    return {"text": text, "engine": engine}


@router.post("/suggest")
def live_suggest_endpoint(
    payload: LiveSuggestRequest,
    db: Session = Depends(get_db),
    _workspace_id: str = Depends(get_workspace_id),
) -> dict[str, str | float]:
    suggestion, engine, seconds = suggest_reply(
        db, [line.model_dump() for line in payload.lines], payload.context, payload.focus
    )
    return {"suggestion": suggestion, "engine": engine, "seconds": seconds}
