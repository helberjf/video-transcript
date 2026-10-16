from collections.abc import Iterator
from contextlib import contextmanager

from app.core.database import SessionLocal
from app.core.request_context import workspace_scope
from app.repositories.upload_repository import UploadRepository


@contextmanager
def upload_workspace_scope(upload_id: str) -> Iterator[None]:
    """Roda o worker no workspace dono do upload, para a chave de IA ser a da conta certa.

    Workers nao herdam o contexto da requisicao que os criou.
    """
    db = SessionLocal()
    try:
        upload = UploadRepository(db).get(upload_id)
        workspace_id = upload.workspace_id if upload else None
    finally:
        db.close()
    with workspace_scope(workspace_id):
        yield
