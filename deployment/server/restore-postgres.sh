#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/backup.dump" >&2
  exit 1
fi

BACKUP_FILE="$1"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose/compose.production.yml}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/env/.env.deploy}"

test -f "${BACKUP_FILE}"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction --exit-on-error' \
  <"${BACKUP_FILE}"
