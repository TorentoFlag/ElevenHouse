#!/usr/bin/env bash

set -euo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/elevenhouse}"
env_file="${deploy_dir}/env/.env.production"

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

require_geoapify_provider() {
  local prefix="$1"
  local enabled
  local base_url
  local api_key
  enabled="$(read_env_value "${prefix}_BIRTH_PLACE_SEARCH_ENABLED")"
  base_url="$(read_env_value "${prefix}_GEOAPIFY_BASE_URL")"
  api_key="$(read_env_value "${prefix}_GEOAPIFY_API_KEY")"

  test "${enabled}" = "true" || fail "${prefix}_BIRTH_PLACE_SEARCH_MUST_BE_ENABLED"
  case "${base_url}" in
    https://*) ;;
    *) fail "${prefix}_GEOAPIFY_BASE_URL_HTTPS_REQUIRED" ;;
  esac
  case "${base_url}" in
    https://api.geoapify.com|https://api.geoapify.com/) ;;
    *) fail "${prefix}_GEOAPIFY_BASE_URL_OFFICIAL_ORIGIN_REQUIRED" ;;
  esac
  case "${api_key}" in
    ""|replace-with-*) fail "${prefix}_GEOAPIFY_API_KEY_REQUIRED" ;;
  esac
}

require_non_placeholder() {
  local key="$1"
  local value
  value="$(read_env_value "${key}")"
  case "${value}" in
    ""|replace-with-*|elevenhouse-example-*) fail "${key}_REQUIRED" ;;
  esac
}

require_https_origin() {
  local key="$1"
  local value
  value="$(read_env_value "${key}")"
  case "${value}" in
    https://*) ;;
    *) fail "${key}_HTTPS_REQUIRED" ;;
  esac
}

require_base64_32_byte_key() {
  local key="$1"
  local value
  value="$(read_env_value "${key}")"
  case "${value}" in
    ""|replace-with-*|elevenhouse-example-*) fail "${key}_REQUIRED" ;;
  esac

  local decoded_file encoded_value byte_count
  decoded_file="$(mktemp)"
  if ! printf '%s' "${value}" | base64 --decode > "${decoded_file}" 2>/dev/null; then
    rm -f -- "${decoded_file}"
    fail "${key}_MUST_BE_BASE64_32_BYTES"
  fi

  byte_count="$(wc -c < "${decoded_file}" | tr -d ' ')"
  encoded_value="$(base64 < "${decoded_file}" | tr -d '\n')"
  rm -f -- "${decoded_file}"

  if [ "${byte_count}" != "32" ] || [ "${encoded_value}" != "${value}" ]; then
    fail "${key}_MUST_BE_BASE64_32_BYTES"
  fi
}

require_positive_integer() {
  local key="$1"
  local value
  value="$(read_env_value "${key}")"
  case "${value}" in
    ""|*[!0-9]*) fail "${key}_POSITIVE_INTEGER_REQUIRED" ;;
  esac
  test "${value}" -gt 0 || fail "${key}_POSITIVE_INTEGER_REQUIRED"
}

require_whatsapp_cloud_astrologer_api() {
  local enabled
  enabled="$(read_env_value ASTROLOGER_API_WHATSAPP_CLOUD_ENABLED)"
  test "${enabled}" = "true" || return 0

  require_non_placeholder ASTROLOGER_API_WHATSAPP_CLOUD_APP_ID
  require_non_placeholder ASTROLOGER_API_WHATSAPP_CLOUD_APP_SECRET
  require_non_placeholder ASTROLOGER_API_WHATSAPP_CLOUD_CONFIGURATION_ID
  require_non_placeholder ASTROLOGER_API_WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN
  require_https_origin ASTROLOGER_API_WHATSAPP_CLOUD_GRAPH_API_BASE_URL
  require_base64_32_byte_key ASTROLOGER_API_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY
}

require_whatsapp_cloud_notification_worker() {
  local enabled
  enabled="$(read_env_value NOTIFICATION_WORKER_WHATSAPP_CLOUD_DELIVERY_ENABLED)"
  test "${enabled}" = "true" || return 0

  require_https_origin NOTIFICATION_WORKER_WHATSAPP_CLOUD_GRAPH_API_BASE_URL
  require_base64_32_byte_key NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY
}

require_messaging_provider_webhook_processing_worker() {
  local enabled
  enabled="$(read_env_value NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ENABLED)"
  test "${enabled}" = "true" || return 0

  require_positive_integer NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ATTEMPTS
  require_positive_integer NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BACKOFF_MS
  require_positive_integer NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BATCH_SIZE
}

test -f "${env_file}" || fail "PRODUCTION_ENV_MISSING"
require_geoapify_provider PUBLIC_API
require_geoapify_provider ASTROLOGER_API
require_whatsapp_cloud_astrologer_api
require_whatsapp_cloud_notification_worker
require_messaging_provider_webhook_processing_worker

printf '%s\n' "production provider preflight passed"
