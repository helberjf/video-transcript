from app.core.tls import install_system_trust_store

# Antes de qualquer import que possa abrir conexao HTTPS.
install_system_trust_store()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from app.api.router import api_router  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.database import Base, SessionLocal, engine, run_startup_migrations  # noqa: E402
from app.models import DocumentModel  # noqa: E402
from app.services.seed_service import seed_report_templates  # noqa: E402


settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    _ = DocumentModel
    Base.metadata.create_all(bind=engine)
    run_startup_migrations()
    db = SessionLocal()
    try:
        seed_report_templates(db)
    finally:
        db.close()


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


app.include_router(api_router)
