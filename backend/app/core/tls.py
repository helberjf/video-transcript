"""Confia na loja de certificados do sistema operacional.

Antivirus e proxies corporativos (Avast, Kaspersky, Zscaler...) inspecionam
HTTPS reemitindo os certificados com uma raiz propria. Essa raiz e instalada na
loja do Windows, mas nao existe no bundle do `certifi` — que e o que requests,
google-genai e yt-dlp usam por padrao. O resultado e CERTIFICATE_VERIFY_FAILED
em toda chamada de IA, enquanto o navegador funciona normalmente.

Injetar o truststore faz o Python usar a loja do sistema, que ja confia nessas
raizes. Precisa rodar antes de qualquer conexao ser aberta.
"""

import logging
import os

logger = logging.getLogger(__name__)


def install_system_trust_store() -> bool:
    """Retorna True se a loja do sistema passou a ser usada na verificacao TLS."""
    if os.environ.get("USE_SYSTEM_TRUST_STORE", "").strip().lower() in {"0", "false", "no"}:
        logger.info("[tls] loja do sistema desativada por USE_SYSTEM_TRUST_STORE")
        return False

    try:
        import truststore
    except ImportError:
        logger.warning(
            "[tls] pacote truststore ausente; se houver antivirus inspecionando HTTPS, "
            "as chamadas de IA podem falhar com CERTIFICATE_VERIFY_FAILED",
        )
        return False

    try:
        truststore.inject_into_ssl()
    except Exception:  # noqa: BLE001 - nunca impedir o boot do backend
        logger.exception("[tls] falha ao usar a loja de certificados do sistema")
        return False

    logger.info("[tls] usando a loja de certificados do sistema")
    return True
