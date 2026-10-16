"""Qual chave de IA cada conta da web usa.

- "admin": dono do sistema. Usa e edita as chaves globais (Ajustes/variaveis de ambiente).
- "shared": conta que o admin autorizou a usar a chave dele. Nao ve nem troca a chave.
- "own": qualquer outra conta. Usa so as proprias chaves, guardadas cifradas.

O acesso vem do token emitido pelo frontend e e copiado para o banco a cada requisicao, porque
os workers em segundo plano nao tem token. Sem workspace conhecido nao ha chave nenhuma: na
duvida, a chave do dono nunca e usada.
"""

from sqlalchemy.orm import Session

from app.core.ai_key_crypto import decrypt_api_key, encrypt_api_key
from app.models.system_config import SystemConfig
from app.models.workspace_ai_key import WorkspaceAiKey


ACCESS_ADMIN = "admin"
ACCESS_SHARED = "shared"
ACCESS_OWN = "own"
ACCESS_VALUES = {ACCESS_ADMIN, ACCESS_SHARED, ACCESS_OWN}
KEY_FIELDS = ("openai_api_key", "gemini_api_key", "claude_api_key")
# Linha com as chaves do dono do sistema, cifradas como as das contas. Nenhum token gera este id:
# normalize_workspace_id remove "_" das pontas.
OWNER_KEYS_ID = "__owner__"


def _can_query(db: Session) -> bool:
    return hasattr(db, "get") and hasattr(db, "add")


def get_ai_key_access(db: Session, workspace_id: str | None) -> str:
    if not workspace_id or not _can_query(db):
        return ACCESS_OWN
    row = db.get(WorkspaceAiKey, workspace_id)
    return row.access if row and row.access in ACCESS_VALUES else ACCESS_OWN


def uses_owner_keys(access: str) -> bool:
    return access in (ACCESS_ADMIN, ACCESS_SHARED)


def sync_ai_key_access(db: Session, workspace_id: str, access: str | None) -> None:
    """Replica no backend o acesso que o frontend calculou para a conta."""
    if not _can_query(db):
        return
    normalized = access if access in ACCESS_VALUES else ACCESS_OWN
    row = db.get(WorkspaceAiKey, workspace_id)
    if row and row.access == normalized:
        return
    if row:
        row.access = normalized
    else:
        db.add(WorkspaceAiKey(workspace_id=workspace_id, access=normalized))
    db.commit()


def read_own_keys(db: Session, workspace_id: str) -> dict[str, str | None]:
    row = db.get(WorkspaceAiKey, workspace_id) if _can_query(db) else None
    return {field: decrypt_api_key(getattr(row, field, None), workspace_id) for field in KEY_FIELDS}


def save_own_keys(db: Session, workspace_id: str, updates: dict[str, str | None]) -> None:
    """Grava so os campos enviados. Valor vazio apaga a chave."""
    row = db.get(WorkspaceAiKey, workspace_id)
    if not row:
        row = WorkspaceAiKey(workspace_id=workspace_id, access=ACCESS_OWN)
        db.add(row)
    for field in KEY_FIELDS:
        if field not in updates:
            continue
        value = (updates[field] or "").strip()
        setattr(row, field, encrypt_api_key(value, workspace_id) if value else None)
    db.commit()


def migrate_plaintext_owner_keys(db: Session, system_config: SystemConfig) -> None:
    """Move para a linha cifrada as chaves que ficaram em texto puro no system_config."""
    plaintext = {field: getattr(system_config, field) for field in KEY_FIELDS if getattr(system_config, field)}
    if not plaintext:
        return
    current = read_own_keys(db, OWNER_KEYS_ID)
    # Uma chave ja cifrada vale mais que a antiga em texto puro.
    save_own_keys(db, OWNER_KEYS_ID, {field: value for field, value in plaintext.items() if not current.get(field)})
    for field in plaintext:
        setattr(system_config, field, None)
    db.commit()
