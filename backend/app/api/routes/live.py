from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import rate_limit
from app.core.workspace import get_workspace_id
from app.services.live_service import MAX_WINDOW_BYTES, suggest_reply, transcribe_window
from app.services.usage_service import charge


router = APIRouter(prefix="/api/live", tags=["live"])


class LiveTranscriptLine(BaseModel):
    speaker: str = Field(max_length=80)
    text: str = Field(max_length=4000)


class LiveSuggestRequest(BaseModel):
    lines: list[LiveTranscriptLine] = Field(default_factory=list, max_length=400)
    context: str | None = Field(default=None, max_length=8000)
    focus: str | None = Field(default=None, max_length=500)


@router.post("/transcribe", dependencies=[rate_limit("live-transcribe")])
def live_transcribe_endpoint(
    audio: UploadFile = File(...),
    language: str | None = Form(None),
    prompt: str | None = Form(None),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, str]:
    data = audio.file.read(MAX_WINDOW_BYTES + 1)
    if not data:
        return {"text": "", "engine": "none"}
    # Janelas de 6 s: cobra 1 credito por minuto com fala, nao por janela (microfone e sistema juntos).
    minute = datetime.utcnow().strftime("%Y%m%d%H%M")
    with charge(db, workspace_id, "live_transcription", idempotency_key=f"live:{workspace_id}:{minute}"):
        text, engine = transcribe_window(db, data, language, prompt)
    return {"text": text, "engine": engine}


@router.post("/suggest", dependencies=[rate_limit("live-suggest")])
def live_suggest_endpoint(
    payload: LiveSuggestRequest,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, str | float]:
    with charge(db, workspace_id, "live_suggestion"):
        suggestion, engine, seconds = suggest_reply(
            db, [line.model_dump() for line in payload.lines], payload.context, payload.focus
        )
    return {"suggestion": suggestion, "engine": engine, "seconds": seconds}
