from fastapi import APIRouter

from app.api.routes import (
    cookies,
    forms,
    history,
    instagram,
    report_templates,
    reports,
    settings,
    transcriptions,
    uploads,
)


api_router = APIRouter()
api_router.include_router(uploads.router)
api_router.include_router(transcriptions.router)
api_router.include_router(reports.router)
api_router.include_router(report_templates.router)
api_router.include_router(forms.router)
api_router.include_router(history.router)
api_router.include_router(settings.router)
api_router.include_router(cookies.router)
api_router.include_router(instagram.router)
