#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_DIR}/backups/postgres}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose/compose.production.yml}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/env/.env.deploy}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

install -d -m 0700 "${BACKUP_DIR}"
PARTIAL_FILE="$(mktemp "${BACKUP_DIR}/elevenhouse-${STAMP}.dump.partial.XXXXXX")"
RANDOM_SUFFIX="${PARTIAL_FILE##*.}"
BACKUP_FILE="${BACKUP_DIR}/elevenhouse-${STAMP}.${RANDOM_SUFFIX}.dump"

cleanup_partial() {
  rm -f -- "${PARTIAL_FILE}"
}

trap cleanup_partial EXIT

"${DOCKER_BIN}" compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  </dev/null \
  >"${PARTIAL_FILE}"

test -s "${PARTIAL_FILE}"

"${DOCKER_BIN}" compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  sh -c 'pg_restore --list >/dev/null' \
  <"${PARTIAL_FILE}"

"${DOCKER_BIN}" compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  sh -c 'pg_restore --exit-on-error --file=/dev/null' \
  <"${PARTIAL_FILE}"

chmod 0600 "${PARTIAL_FILE}"
ln -- "${PARTIAL_FILE}" "${BACKUP_FILE}"
rm -- "${PARTIAL_FILE}"
trap - EXIT

find "${BACKUP_DIR}" -type f -name 'elevenhouse-*.dump' -mtime +14 -delete
find "${BACKUP_DIR}" -type f -name 'elevenhouse-*.dump.partial.*' -mtime +1 -delete
printf 'Published verified PostgreSQL backup: %s\n' "${BACKUP_FILE}"
