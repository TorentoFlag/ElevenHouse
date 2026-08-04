#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
SOURCE_ENV_FILE="${SOURCE_ENV_FILE:-${DEPLOY_DIR}/env/.env.production}"
CHART_ENGINE_ENV_FILE="${CHART_ENGINE_ENV_FILE:-${DEPLOY_DIR}/env/.env.chart-engine.production}"
CHART_WORKER_ENV_FILE="${CHART_WORKER_ENV_FILE:-${DEPLOY_DIR}/env/.env.chart-worker.production}"

chart_engine_keys=(
  CHART_ENGINE_EXPECTED_EPHEMERIS
  CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS
  CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION
  CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS
  CHART_ENGINE_CALCULATION_CONCURRENCY
  CHART_WORKER_CALCULATION_TIMEOUT_MS
)

chart_worker_keys=(
  DATABASE_URL
  REDIS_URL
  CHART_ENGINE_BASE_URL
  CHART_ENGINE_EXPECTED_EPHEMERIS
  CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS
  CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION
  CHART_WORKER_HEALTH_PORT
  CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS
  CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE
  CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS
  CHART_WORKER_BACKOFF_MS
  CHART_WORKER_JITTER
  CHART_WORKER_CONCURRENCY
  CHART_WORKER_LEASE_MS
  CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS
  CHART_WORKER_CALCULATION_TIMEOUT_MS
  CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS
  CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE
  CHART_WORKER_TELEMETRY_INTERVAL_MS
  ASTRO_CALENDAR_WORKER_ATTEMPTS
)

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [ ! -f "${SOURCE_ENV_FILE}" ] || [ -L "${SOURCE_ENV_FILE}" ]; then
  fail "CHART_SERVICE_ENV_SOURCE_INVALID"
fi

install -d -m 0700 "$(dirname "${CHART_ENGINE_ENV_FILE}")"
install -d -m 0700 "$(dirname "${CHART_WORKER_ENV_FILE}")"
umask 077
chart_engine_temp="$(mktemp "${CHART_ENGINE_ENV_FILE}.XXXXXX.tmp")"
chart_worker_temp="$(mktemp "${CHART_WORKER_ENV_FILE}.XXXXXX.tmp")"

cleanup_temps() {
  rm -f -- "${chart_engine_temp}" "${chart_worker_temp}"
}

trap cleanup_temps EXIT

copy_required_key() {
  local key="$1"
  local target="$2"
  local line
  local status
  if line="$(
    awk -v required_key="${key}" '
      {
        current = $0
        sub(/\r$/, "", current)
        if (index(current, required_key "=") == 1) {
          matches += 1
          matched_line = current
          value = substr(current, length(required_key) + 2)
          if (value ~ /^[[:space:]]*$/) empty = 1
          first = substr(value, 1, 1)
          last = substr(value, length(value), 1)
          quote = sprintf("%c", 39)
          if (value ~ /[[:space:]]/ || first == "\"" || first == quote || last == "\"" || last == quote) raw_incompatible = 1
        }
      }
      END {
        if (matches == 0) exit 42
        if (matches > 1) exit 43
        if (empty == 1) exit 44
        if (raw_incompatible == 1) exit 45
        print matched_line
      }
    ' "${SOURCE_ENV_FILE}"
  )"; then
    printf '%s\n' "${line}" >>"${target}"
    return
  else
    status="$?"
  fi

  case "${status}" in
    42) fail "CHART_SERVICE_ENV_REQUIRED_KEY_MISSING:${key}" ;;
    43) fail "CHART_SERVICE_ENV_REQUIRED_KEY_DUPLICATE:${key}" ;;
    44) fail "CHART_SERVICE_ENV_REQUIRED_KEY_EMPTY:${key}" ;;
    45) fail "CHART_SERVICE_ENV_REQUIRED_KEY_RAW_INCOMPATIBLE:${key}" ;;
    *) fail "CHART_SERVICE_ENV_SOURCE_READ_FAILED:${key}" ;;
  esac
}

for key in "${chart_engine_keys[@]}"; do
  copy_required_key "${key}" "${chart_engine_temp}"
done
for key in "${chart_worker_keys[@]}"; do
  copy_required_key "${key}" "${chart_worker_temp}"
done

chmod 0600 "${chart_engine_temp}" "${chart_worker_temp}"
mv -f "${chart_engine_temp}" "${CHART_ENGINE_ENV_FILE}"
mv -f "${chart_worker_temp}" "${CHART_WORKER_ENV_FILE}"
trap - EXIT

printf 'Materialized chart-engine (%s keys) and chart-worker (%s keys) environments.\n' \
  "${#chart_engine_keys[@]}" "${#chart_worker_keys[@]}"
