import sys
import traceback

import uvicorn
from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    try:
        from app.main import app
    except Exception:
        traceback.print_exc()
        raise

    uvicorn.run(
        app,
        host=settings.app_host,
        port=settings.app_port,
        reload="--reload" in sys.argv,
    )


if __name__ == "__main__":
    main()
