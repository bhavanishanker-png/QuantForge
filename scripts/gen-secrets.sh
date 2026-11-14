#!/usr/bin/env bash
# Replaces every change-me value in .env with a random secret. Safe to re-run only BEFORE the
# first `docker compose up` (Postgres stores role passwords on first start).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
tmp=$(mktemp)
while IFS= read -r line; do
  if [[ "$line" =~ ^([A-Z_]+)=change-me ]]; then
    echo "${BASH_REMATCH[1]}=$(openssl rand -hex 32)"
  else
    echo "$line"
  fi
done < .env > "$tmp"
mv "$tmp" .env
echo "Secrets written to .env"
