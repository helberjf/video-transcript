import sys

from app.core.tls import install_system_trust_store

install_system_trust_store()

import uvicorn  # noqa: E402
from app.core.config import get_settings  # noqa: E402


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload="--reload" in sys.argv,
    )


if __name__ == "__main__":
    main()
