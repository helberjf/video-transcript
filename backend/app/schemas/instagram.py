from datetime import datetime

from pydantic import BaseModel, Field


class InstagramPostReadRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


class InstagramSlide(BaseModel):
    index: int
    display_id: str | None = None
    media_kind: str
    thumbnail_url: str | None = None
    direct_url: str | None = None
    duration_seconds: float | None = None


class InstagramPostInfo(BaseModel):
    url: str
    canonical_url: str
    source_type: str
    shortcode: str | None = None
    title: str | None = None
    caption: str | None = None
    author: str | None = None
    author_id: str | None = None
    media_kind: str
    duration_seconds: float | None = None
    view_count: int | None = None
    like_count: int | None = None
    comment_count: int | None = None
    upload_date: str | None = None
    thumbnail_url: str | None = None
    hashtags: list[str] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    raw_summary: str
    slides: list[InstagramSlide] = Field(default_factory=list)


class InstagramPostReadResponse(BaseModel):
    post: InstagramPostInfo
    suggestions: list[str]
    confirmation_question: str
    prompt_seed: str
    used_cookies: bool
    inspected_at: datetime


class InstagramAnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


class InstagramAnalyzeSlideResult(BaseModel):
    index: int
    display_id: str | None = None
    media_kind: str
    ocr_text: str | None = None
    provider: str | None = None
    error: str | None = None


class InstagramAnalyzeJobStatus(BaseModel):
    job_id: str
    status: str
    progress: float
    current_slide: int
    total_slides: int
    error: str | None = None
    slides: list[InstagramAnalyzeSlideResult] = Field(default_factory=list)
    started_at: datetime | None = None
    completed_at: datetime | None = None
