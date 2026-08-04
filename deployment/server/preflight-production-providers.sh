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

test -f "${env_file}" || fail "PRODUCTION_ENV_MISSING"
require_geoapify_provider PUBLIC_API
require_geoapify_provider ASTROLOGER_API

printf '%s\n' "production provider preflight passed"
