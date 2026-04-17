#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

(cd "$ROOT_DIR/backend" && ./start_backend.sh) &
(cd "$ROOT_DIR/frontend" && ./start_frontend.sh) &

wait
