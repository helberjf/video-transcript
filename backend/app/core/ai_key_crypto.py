"""Criptografia das chaves de IA de cada conta (AES-256-GCM).

A chave mestra vem de AI_KEYS_ENCRYPTION_KEY e existe so no ambiente do servidor; o banco guarda
apenas o texto cifrado. O workspace entra como dado associado: uma chave copiada para a linha de
outra conta no banco nao decifra.
"""

import base64
import hashlib
import logging
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings


logger = logging.getLogger(__name__)

PREFIX = "v1:"
NONCE_BYTES = 12
MIN_SECRET_LENGTH = 32
DEV_SECRET = "modeloia-dev-ai-keys-secret-nao-use-em-producao"


class AiKeyCryptoError(RuntimeError):
    pass


def _master_key() -> bytes:
    settings = get_settings()
    secret = settings.ai_keys_encryption_key or (DEV_SECRET if settings.app_env == "development" else None)
    if not secret or len(secret) < MIN_SECRET_LENGTH:
        raise AiKeyCryptoError("AI_KEYS_ENCRYPTION_KEY ausente ou curta demais (minimo de 32 caracteres).")
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_api_key(value: str, workspace_id: str) -> str:
    nonce = os.urandom(NONCE_BYTES)
    ciphertext = AESGCM(_master_key()).encrypt(nonce, value.encode("utf-8"), workspace_id.encode("utf-8"))
    return PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_api_key(value: str | None, workspace_id: str) -> str | None:
    if not value:
        return None
    if not value.startswith(PREFIX):
        logger.warning("Chave de IA do workspace %s esta em formato desconhecido", workspace_id)
        return None
    try:
        raw = base64.urlsafe_b64decode(value[len(PREFIX) :].encode("ascii"))
        plain = AESGCM(_master_key()).decrypt(raw[:NONCE_BYTES], raw[NONCE_BYTES:], workspace_id.encode("utf-8"))
    except (InvalidTag, ValueError):
        logger.warning("Chave de IA do workspace %s nao pode ser decifrada", workspace_id)
        return None
    return plain.decode("utf-8")
