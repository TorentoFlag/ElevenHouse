#!/usr/bin/env bash

set -euo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/elevenhouse}"
env_file="${deploy_dir}/env/.env.production"
ephemeris_dir="${deploy_dir}/ephemeris"
expected_revision="sha256:8d68647580a9952102ca50c975fc55d9e26f102aafcc090f853e172080118032"

read_env_value() {
  local key="$1"
  awk -v key="${key}" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      sub(/\r$/, "", value)
    }
    END { print value }
  ' "${env_file}"
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

test -f "${env_file}" || fail "EPHEMERIS_PRODUCTION_ENV_MISSING"

test "$(read_env_value NODE_ENV)" = "production" ||
  fail "CHART_RUNTIME_NODE_ENV_NOT_PRODUCTION"

require_runtime_value() {
  local key="$1"
  local value
  value="$(read_env_value "${key}")"
  case "${value}" in
    ""|replace-with-*) fail "${key}_REQUIRED" ;;
  esac
}

for key in \
  REDIS_URL \
  CHART_ENGINE_BASE_URL \
  CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS \
  CHART_ENGINE_CALCULATION_CONCURRENCY \
  CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS \
  CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE \
  CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS \
  CHART_WORKER_BACKOFF_MS \
  CHART_WORKER_JITTER \
  CHART_WORKER_CONCURRENCY \
  CHART_WORKER_LEASE_MS \
  CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS \
  CHART_WORKER_CALCULATION_TIMEOUT_MS \
  CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS \
  CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE \
  CHART_WORKER_TELEMETRY_INTERVAL_MS \
  ASTRO_CALENDAR_WORKER_ATTEMPTS
do
  require_runtime_value "${key}"
done

chart_engine_base_url="$(read_env_value CHART_ENGINE_BASE_URL)"
case "${chart_engine_base_url}" in
  http://chart-engine:8012|http://chart-engine:8012/) ;;
  *) fail "CHART_ENGINE_BASE_URL_PRODUCTION_ORIGIN_INVALID" ;;
esac

calculation_timeout_seconds="$(read_env_value CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS)"
calculation_concurrency="$(read_env_value CHART_ENGINE_CALCULATION_CONCURRENCY)"
worker_lease_ms="$(read_env_value CHART_WORKER_LEASE_MS)"
worker_storage_timeout_ms="$(read_env_value CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS)"
worker_calculation_timeout_ms="$(read_env_value CHART_WORKER_CALCULATION_TIMEOUT_MS)"

awk -v value="${calculation_timeout_seconds}" 'BEGIN {
  valid = value ~ /^[0-9]+([.][0-9]+)?$/ && value > 0 && value <= 86400
  exit valid ? 0 : 1
}' || fail "CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS_INVALID"

case "${calculation_concurrency}" in
  ""|*[!0-9]*) fail "CHART_ENGINE_CALCULATION_CONCURRENCY_INVALID" ;;
esac
test "${calculation_concurrency}" -ge 1 && test "${calculation_concurrency}" -le 32 ||
  fail "CHART_ENGINE_CALCULATION_CONCURRENCY_INVALID"

case "${worker_lease_ms}" in
  ""|*[!0-9]*) fail "CHART_WORKER_LEASE_MS_INVALID" ;;
esac
test "${worker_lease_ms}" -ge 1000 && test "${worker_lease_ms}" -le 86400000 ||
  fail "CHART_WORKER_LEASE_MS_INVALID"

case "${worker_storage_timeout_ms}" in
  ""|*[!0-9]*) fail "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS_INVALID" ;;
esac
test "${worker_storage_timeout_ms}" -ge 100 ||
  fail "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS_INVALID"
test "${worker_storage_timeout_ms}" -le 5000 ||
  fail "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS_PRODUCTION_MAX_EXCEEDED"
test "$((worker_storage_timeout_ms * 2))" -lt "${worker_lease_ms}" ||
  fail "CHART_WORKER_STORAGE_TIMEOUT_LEASE_MARGIN_INVALID"

case "${worker_calculation_timeout_ms}" in
  ""|*[!0-9]*) fail "CHART_WORKER_CALCULATION_TIMEOUT_MS_INVALID" ;;
esac
test "${worker_calculation_timeout_ms}" -ge 1 &&
  test "${worker_calculation_timeout_ms}" -le 86400000 ||
  fail "CHART_WORKER_CALCULATION_TIMEOUT_MS_INVALID"

awk \
  -v engine_seconds="${calculation_timeout_seconds}" \
  -v worker_ms="${worker_calculation_timeout_ms}" \
  'BEGIN { exit (engine_seconds * 1000 + 5000 <= worker_ms) ? 0 : 1 }' ||
  fail "CHART_ENGINE_CALCULATION_TIMEOUT_MARGIN_INVALID"

expected_ephemeris="$(read_env_value CHART_ENGINE_EXPECTED_EPHEMERIS)"
expected_flags="$(read_env_value CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS)"
configured_revision="$(read_env_value CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION)"

test "${expected_ephemeris}" = "swiss-ephemeris" ||
  fail "EPHEMERIS_PROFILE_NOT_PRODUCTION_SWISS"
test "${expected_flags}" = "FLG_SWIEPH,FLG_SPEED" ||
  fail "EPHEMERIS_FLAGS_NOT_PRODUCTION_SWISS"
test "${configured_revision}" = "${expected_revision}" ||
  fail "EPHEMERIS_DATA_REVISION_MISMATCH"

if test -L "${ephemeris_dir}" || ! test -d "${ephemeris_dir}"; then
  fail "EPHEMERIS_DATA_ARTIFACTS_INCOMPLETE"
fi

verify_artifact() {
  local artifact_name="$1"
  local expected_hash="$2"
  local artifact_path="${ephemeris_dir}/${artifact_name}"
  if test -L "${artifact_path}" || ! test -f "${artifact_path}"; then
    fail "EPHEMERIS_DATA_ARTIFACTS_INCOMPLETE"
  fi
  local actual_hash
  actual_hash="$(sha256sum "${artifact_path}" | awk '{ print $1 }')"
  test -n "${actual_hash}" || fail "EPHEMERIS_DATA_ARTIFACT_HASH_UNPROVEN"
  test "${actual_hash}" = "${expected_hash}" ||
    fail "EPHEMERIS_DATA_ARTIFACT_HASH_MISMATCH"
}

verify_artifact \
  "semo_18.se1" \
  "1ca07bd67c24374d77226180c20a4f9996cba013697894810518e7eb582ca4f7"
verify_artifact \
  "sepl_18.se1" \
  "ca1393ceab3a44fbc895887cf789c68819ae6a1cbc9b22225872dbe4ccd99a66"

printf '%s\n' "chart ephemeris preflight passed"
