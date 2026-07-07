#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_DIR}/backups/postgres}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose/compose.production.yml}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/env/.env.deploy}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/elevenhouse-${STAMP}.dump"
PARTIAL_FILE="${BACKUP_FILE}.partial"

install -d -m 0700 "${BACKUP_DIR}"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  >"${PARTIAL_FILE}"

mv "${PARTIAL_FILE}" "${BACKUP_FILE}"

find "${BACKUP_DIR}" -type f -name 'elevenhouse-*.dump' -mtime +14 -delete
find "${BACKUP_DIR}" -type f -name 'elevenhouse-*.dump.partial' -mtime +1 -delete
ls -lh "${BACKUP_FILE}"
