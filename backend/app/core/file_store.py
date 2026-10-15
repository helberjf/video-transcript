"""Arquivos das gravacoes (pedacos, audio final, capturas).

No desktop ficam no disco. Na Vercel o disco e efemero (cada requisicao pode cair numa maquina
diferente), entao com FILE_STORAGE=database os bytes vao para a tabela stored_files do Postgres.
"""

import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, Integer, LargeBinary, String, delete, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.config import get_settings
from app.core.database import Base, SessionLocal


class StoredFile(Base):
    __tablename__ = "stored_files"

    key: Mapped[str] = mapped_column(String(300), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


def uses_database() -> bool:
    return get_settings().file_storage.strip().lower() == "database"


def _disk_path(key: str) -> Path:
    root = get_settings().storage_dir.resolve()
    path = (root / key).resolve()
    if root not in path.parents:
        raise ValueError("Chave de arquivo invalida")
    return path


@contextmanager
def _session(db: Session | None) -> Iterator[Session]:
    if db is not None:
        yield db
        return
    own = SessionLocal()
    try:
        yield own
    finally:
        own.close()


def put(key: str, data: bytes, db: Session | None = None) -> None:
    if not uses_database():
        path = _disk_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return
    with _session(db) as session:
        existing = session.get(StoredFile, key)
        if existing:
            existing.data = data
            existing.size = len(data)
        else:
            session.add(StoredFile(key=key, data=data, size=len(data)))
        session.commit()


def get(key: str, db: Session | None = None) -> bytes | None:
    if not uses_database():
        path = _disk_path(key)
        return path.read_bytes() if path.is_file() else None
    with _session(db) as session:
        row = session.get(StoredFile, key)
        return bytes(row.data) if row else None


def list_keys(prefix: str, db: Session | None = None) -> list[str]:
    if not uses_database():
        directory = _disk_path(prefix)
        if not directory.is_dir():
            return []
        root = get_settings().storage_dir.resolve()
        return sorted(path.resolve().relative_to(root).as_posix() for path in directory.iterdir() if path.is_file())
    with _session(db) as session:
        return list(session.scalars(select(StoredFile.key).where(StoredFile.key.startswith(prefix)).order_by(StoredFile.key)))


def delete_key(key: str, db: Session | None = None) -> None:
    if not uses_database():
        _disk_path(key).unlink(missing_ok=True)
        return
    with _session(db) as session:
        session.execute(delete(StoredFile).where(StoredFile.key == key))
        session.commit()


def delete_prefix(prefix: str, db: Session | None = None) -> None:
    if not uses_database():
        shutil.rmtree(_disk_path(prefix), ignore_errors=True)
        return
    with _session(db) as session:
        session.execute(delete(StoredFile).where(StoredFile.key.startswith(prefix)))
        session.commit()


@contextmanager
def local_copy(key: str, suffix: str, db: Session | None = None) -> Iterator[Path]:
    """Caminho no disco para bibliotecas que so aceitam arquivo (ffmpeg, SDKs de IA)."""
    if not uses_database():
        yield _disk_path(key)
        return
    data = get(key, db)
    if data is None:
        raise FileNotFoundError(key)
    temp_dir = get_settings().temp_dir
    temp_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=suffix, dir=temp_dir, delete=False) as handle:
        handle.write(data)
        path = Path(handle.name)
    try:
        yield path
    finally:
        path.unlink(missing_ok=True)
