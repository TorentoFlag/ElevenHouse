#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
RETENTION_DIR="${RETENTION_DIR:-${DEPLOY_DIR}/retention}"
SUCCESSFUL_RELEASES_DIR="${SUCCESSFUL_RELEASES_DIR:-${RETENTION_DIR}/successful-releases}"
SUCCESSFUL_RELEASES_LOG="${SUCCESSFUL_RELEASES_LOG:-${RETENTION_DIR}/successful-releases.log}"
LIVE_COMPOSE_FILE="${LIVE_COMPOSE_FILE:-${DEPLOY_DIR}/compose/compose.production.yml}"
LIVE_DEPLOY_ENV_FILE="${LIVE_DEPLOY_ENV_FILE:-${DEPLOY_DIR}/env/.env.deploy}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-elevenhouse}"

PARTIAL_SNAPSHOT_DIR=""
PARTIAL_LOG_FILE=""

cleanup_partial_files() {
  if [ -n "${PARTIAL_SNAPSHOT_DIR}" ] && [ -d "${PARTIAL_SNAPSHOT_DIR}" ]; then
    case "${PARTIAL_SNAPSHOT_DIR}" in
      "${SUCCESSFUL_RELEASES_DIR}"/.*.partial.*)
        rm -f -- \
          "${PARTIAL_SNAPSHOT_DIR}/image-ids.txt" \
          "${PARTIAL_SNAPSHOT_DIR}/compose.production.yml" \
          "${PARTIAL_SNAPSHOT_DIR}/env.deploy"
        rmdir -- "${PARTIAL_SNAPSHOT_DIR}" 2>/dev/null || true
        ;;
    esac
  fi
  if [ -n "${PARTIAL_LOG_FILE}" ] && [ -f "${PARTIAL_LOG_FILE}" ]; then
    case "${PARTIAL_LOG_FILE}" in
      "${RETENTION_DIR}"/.successful-releases.log.partial.*)
        rm -f -- "${PARTIAL_LOG_FILE}"
        ;;
    esac
  fi
}

trap cleanup_partial_files EXIT

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

docker_cmd() {
  "${DOCKER_BIN}" "$@"
}

sorted_unique_ids() {
  awk '
    /^[[:space:]]*$/ { next }
    length($0) != 71 || substr($0, 1, 7) != "sha256:" || substr($0, 8) ~ /[^0-9a-f]/ {
      exit 65
    }
    { print }
  ' | sort -u || fail "DOCKER_IMAGE_ID_INVALID"
}

ensure_retention_directories() {
  if [ -L "${RETENTION_DIR}" ] || { [ -e "${RETENTION_DIR}" ] && [ ! -d "${RETENTION_DIR}" ]; }; then
    fail "SUCCESSFUL_RELEASE_RETENTION_DIRECTORY_INVALID"
  fi
  if [ -L "${SUCCESSFUL_RELEASES_DIR}" ] || {
    [ -e "${SUCCESSFUL_RELEASES_DIR}" ] && [ ! -d "${SUCCESSFUL_RELEASES_DIR}" ]
  }; then
    fail "SUCCESSFUL_RELEASES_DIRECTORY_INVALID"
  fi
  install -d -m 0700 "${RETENTION_DIR}" "${SUCCESSFUL_RELEASES_DIR}"
}

validate_successful_release_log() {
  if [ -L "${SUCCESSFUL_RELEASES_LOG}" ] || {
    [ -e "${SUCCESSFUL_RELEASES_LOG}" ] && [ ! -f "${SUCCESSFUL_RELEASES_LOG}" ]
  }; then
    fail "SUCCESSFUL_RELEASE_LOG_INVALID"
  fi
}

validate_image_ids_file() {
  local image_ids_file="$1"
  if ! awk '
    BEGIN { count = 0 }
    length($0) != 71 || substr($0, 1, 7) != "sha256:" || substr($0, 8) ~ /[^0-9a-f]/ {
      exit 1
    }
    { count += 1 }
    END { if (count == 0) exit 1 }
  ' "${image_ids_file}"; then
    fail "SUCCESSFUL_RELEASE_IMAGE_SET_INVALID"
  fi
}

validate_deploy_env_file() {
  local deploy_env_file="$1"
  if [ ! -s "${deploy_env_file}" ] || [ -L "${deploy_env_file}" ]; then
    fail "SUCCESSFUL_RELEASE_DEPLOY_ENV_INVALID"
  fi
  if ! awk '
    BEGIN {
      namespace_count = 0
      tag_count = 0
      project_count = 0
      valid = 1
    }
    index($0, "IMAGE_NAMESPACE=") == 1 {
      namespace_count += 1
      if ($0 != "IMAGE_NAMESPACE=ghcr.io/torentoflag") valid = 0
      next
    }
    index($0, "IMAGE_TAG=") == 1 {
      tag_count += 1
      value = substr($0, length("IMAGE_TAG=") + 1)
      if (length(value) != 40 || value ~ /[^0-9a-f]/) valid = 0
      next
    }
    index($0, "COMPOSE_PROJECT_NAME=") == 1 {
      project_count += 1
      if ($0 != "COMPOSE_PROJECT_NAME=elevenhouse") valid = 0
      next
    }
    { valid = 0 }
    END {
      if (namespace_count != 1 || tag_count != 1 || project_count != 1) valid = 0
      exit valid ? 0 : 1
    }
  ' "${deploy_env_file}"; then
    fail "SUCCESSFUL_RELEASE_DEPLOY_ENV_INVALID"
  fi
}

project_container_image_ids() {
  docker_cmd ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" | while IFS= read -r container_id; do
    [ -n "${container_id}" ] || continue
    docker_cmd inspect --format '{{.Image}}' "${container_id}"
  done | sorted_unique_ids
}

all_container_image_ids() {
  docker_cmd ps -aq | while IFS= read -r container_id; do
    [ -n "${container_id}" ] || continue
    docker_cmd inspect --format '{{.Image}}' "${container_id}"
  done | sorted_unique_ids
}

validate_release_id() {
  local release_id="$1"
  if [[ ! "${release_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
    fail "SUCCESSFUL_RELEASE_ID_INVALID"
  fi
}

validate_release_snapshot() {
  local release_id="$1"
  validate_release_id "${release_id}"

  local snapshot_dir="${SUCCESSFUL_RELEASES_DIR}/${release_id}"
  if [ ! -d "${snapshot_dir}" ] || [ -L "${snapshot_dir}" ]; then
    fail "SUCCESSFUL_RELEASE_SNAPSHOT_MISSING"
  fi
  if [ ! -s "${snapshot_dir}/image-ids.txt" ] || [ -L "${snapshot_dir}/image-ids.txt" ]; then
    fail "SUCCESSFUL_RELEASE_IMAGE_SET_INVALID"
  fi
  validate_image_ids_file "${snapshot_dir}/image-ids.txt"
  if [ ! -s "${snapshot_dir}/compose.production.yml" ] || [ -L "${snapshot_dir}/compose.production.yml" ]; then
    fail "SUCCESSFUL_RELEASE_COMPOSE_INVALID"
  fi
  validate_deploy_env_file "${snapshot_dir}/env.deploy"
}

capture_release_snapshot() {
  local release_id="$1"
  validate_release_id "${release_id}"
  ensure_retention_directories

  local snapshot_dir="${SUCCESSFUL_RELEASES_DIR}/${release_id}"
  if [ -e "${snapshot_dir}" ] || [ -L "${snapshot_dir}" ]; then
    validate_release_snapshot "${release_id}"
    return
  fi
  if [ ! -f "${LIVE_COMPOSE_FILE}" ] || [ -L "${LIVE_COMPOSE_FILE}" ]; then
    fail "SUCCESSFUL_RELEASE_LIVE_COMPOSE_INVALID"
  fi
  validate_deploy_env_file "${LIVE_DEPLOY_ENV_FILE}"

  PARTIAL_SNAPSHOT_DIR="$(mktemp -d "${SUCCESSFUL_RELEASES_DIR}/.${release_id}.partial.XXXXXX")"
  project_container_image_ids > "${PARTIAL_SNAPSHOT_DIR}/image-ids.txt"
  if [ ! -s "${PARTIAL_SNAPSHOT_DIR}/image-ids.txt" ]; then
    fail "SUCCESSFUL_RELEASE_IMAGE_SET_EMPTY"
  fi
  cp -- "${LIVE_COMPOSE_FILE}" "${PARTIAL_SNAPSHOT_DIR}/compose.production.yml"
  cp -- "${LIVE_DEPLOY_ENV_FILE}" "${PARTIAL_SNAPSHOT_DIR}/env.deploy"
  chmod 0600 \
    "${PARTIAL_SNAPSHOT_DIR}/image-ids.txt" \
    "${PARTIAL_SNAPSHOT_DIR}/compose.production.yml" \
    "${PARTIAL_SNAPSHOT_DIR}/env.deploy"
  mv -- "${PARTIAL_SNAPSHOT_DIR}" "${snapshot_dir}"
  PARTIAL_SNAPSHOT_DIR=""
}

append_successful_release() {
  local release_id="$1"
  validate_release_snapshot "${release_id}"
  validate_successful_release_log

  local last_release=""
  if [ -s "${SUCCESSFUL_RELEASES_LOG}" ]; then
    last_release="$(tail -n 1 "${SUCCESSFUL_RELEASES_LOG}")"
  fi
  if [ "${last_release}" = "${release_id}" ]; then
    return
  fi

  PARTIAL_LOG_FILE="$(mktemp "${RETENTION_DIR}/.successful-releases.log.partial.XXXXXX")"
  if [ -f "${SUCCESSFUL_RELEASES_LOG}" ]; then
    cat "${SUCCESSFUL_RELEASES_LOG}" > "${PARTIAL_LOG_FILE}"
  fi
  printf '%s\n' "${release_id}" >> "${PARTIAL_LOG_FILE}"
  chmod 0600 "${PARTIAL_LOG_FILE}"
  mv -- "${PARTIAL_LOG_FILE}" "${SUCCESSFUL_RELEASES_LOG}"
  PARTIAL_LOG_FILE=""
}

bootstrap_successful_release() {
  ensure_retention_directories
  validate_successful_release_log

  if [ -s "${SUCCESSFUL_RELEASES_LOG}" ]; then
    local last_release
    last_release="$(tail -n 1 "${SUCCESSFUL_RELEASES_LOG}")"
    validate_release_snapshot "${last_release}"
    printf 'Preserved successful release %s.\n' "${last_release}"
    return
  fi

  if [ ! -e "${LIVE_COMPOSE_FILE}" ] && [ ! -L "${LIVE_COMPOSE_FILE}" ]; then
    local image_ids_file
    image_ids_file="$(mktemp "${RETENTION_DIR}/.bootstrap-image-ids.XXXXXX")"
    project_container_image_ids > "${image_ids_file}"
    if [ -s "${image_ids_file}" ]; then
      rm -f -- "${image_ids_file}"
      fail "SUCCESSFUL_RELEASE_LIVE_COMPOSE_REQUIRED"
    fi
    rm -f -- "${image_ids_file}"
    printf '%s\n' 'No previous production release to bootstrap.'
    return
  fi

  local release_id
  release_id="bootstrap-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  capture_release_snapshot "${release_id}"
  append_successful_release "${release_id}"
  printf 'Bootstrapped successful release %s.\n' "${release_id}"
}

record_successful_release() {
  local release_id="$1"
  capture_release_snapshot "${release_id}"
  append_successful_release "${release_id}"
  printf 'Recorded successful release %s.\n' "${release_id}"
}

successful_release_image_ids_for_retention() {
  validate_successful_release_log
  if [ ! -s "${SUCCESSFUL_RELEASES_LOG}" ]; then
    fail "SUCCESSFUL_RELEASE_LOG_MISSING"
  fi

  tail -n 2 "${SUCCESSFUL_RELEASES_LOG}" | while IFS= read -r release_id; do
    [ -n "${release_id}" ] || continue
    validate_release_snapshot "${release_id}"
    cat "${SUCCESSFUL_RELEASES_DIR}/${release_id}/image-ids.txt"
  done | sorted_unique_ids
}

cleanup_after_success() {
  ensure_retention_directories

  local successful_images_file keep_file all_images_file removable_file
  successful_images_file="$(mktemp)"
  keep_file="$(mktemp)"
  all_images_file="$(mktemp)"
  removable_file="$(mktemp)"
  trap 'rm -f "${successful_images_file}" "${keep_file}" "${all_images_file}" "${removable_file}"' RETURN

  successful_release_image_ids_for_retention > "${successful_images_file}"
  docker_cmd container prune -f
  {
    all_container_image_ids
    cat "${successful_images_file}"
  } | sorted_unique_ids > "${keep_file}"

  docker_cmd image ls --all --quiet --no-trunc | sorted_unique_ids > "${all_images_file}"
  comm -23 "${all_images_file}" "${keep_file}" > "${removable_file}"

  local removable_count
  removable_count="$(wc -l < "${removable_file}" | tr -d ' ')"
  printf 'Removing %s unused image ids; retaining current containers and the last two successful releases.\n' "${removable_count}"

  while IFS= read -r image_id; do
    [ -n "${image_id}" ] || continue
    docker_cmd image rm "${image_id}"
  done < "${removable_file}"

  docker_cmd builder prune -af
  docker_cmd network prune -f
  docker_cmd system df
}

case "${1:-}" in
  bootstrap-successful-release)
    bootstrap_successful_release
    ;;
  record-successful-release)
    [ "$#" -eq 2 ] || fail "SUCCESSFUL_RELEASE_ID_REQUIRED"
    record_successful_release "$2"
    ;;
  cleanup-after-success)
    cleanup_after_success
    ;;
  *)
    printf 'Usage: %s {bootstrap-successful-release|record-successful-release <release-id>|cleanup-after-success}\n' "$0" >&2
    exit 64
    ;;
esac
