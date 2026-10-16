from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import CaptureTrigger
from app.schemas.common import ORMModel


AnalysisMode = Literal["audio", "audio_images"]


class RecordingStartRequest(BaseModel):
    title: str | None = Field(default=None, max_length=140)
    language: str | None = Field(default="pt-BR", max_length=20)
    capture_screens: bool = True


class RecordingStartResponse(BaseModel):
    id: str


class RecordingFinishRequest(BaseModel):
    analysis_mode: AnalysisMode = "audio"
    duration_seconds: float | None = Field(default=None, ge=0)
    # [segundos, energia do microfone, energia do audio do sistema]
    energy: list[list[float]] = Field(default_factory=list, max_length=200_000)
    markers: list[dict] = Field(default_factory=list, max_length=500)
    has_system_audio: bool | None = None


class CaptureRead(ORMModel):
    id: str
    upload_id: str
    offset_seconds: float
    trigger: CaptureTrigger
    width: int | None
    height: int | None
    is_duplicate: bool
    included: bool
    description: str | None
    vision_engine: str | None
    created_at: datetime


class CaptureUpdateRequest(BaseModel):
    included: bool


class SpeakerRenameRequest(BaseModel):
    names: dict[str, str]


class ChecklistItemUpdate(BaseModel):
    feito: bool


class ChecklistItemCreate(BaseModel):
    tarefa: str = Field(min_length=1, max_length=300)


class MeetingQuestion(BaseModel):
    pergunta: str = Field(min_length=1, max_length=1000)
