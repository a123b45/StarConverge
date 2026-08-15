#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DATABASE_PATH:-/data/starconverge.db}"
mkdir -p "$(dirname "$DB_PATH")"

if [[ ! -f "$DB_PATH" ]]; then
  echo "[entrypoint] initializing database..."
  cd /app
  # seed via tsx source if dist tools unavailable; prefer compiled path
  if [[ -f /app/server/dist/db/seed.js ]]; then
    node /app/server/dist/db/seed.js || true
  else
    pnpm --filter @starconverge/server db:seed || true
  fi
fi

exec node /app/server/dist/index.js
