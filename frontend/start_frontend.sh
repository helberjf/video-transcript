#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
fi

npm run dev
