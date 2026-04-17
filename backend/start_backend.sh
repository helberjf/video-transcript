#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
