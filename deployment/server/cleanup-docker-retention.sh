#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
RETENTION_DIR="${RETENTION_DIR:-${DEPLOY_DIR}/retention}"
ROLLBACK_IMAGE_IDS_FILE="${ROLLBACK_IMAGE_IDS_FILE:-${RETENTION_DIR}/rollback-image-ids.txt}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-elevenhouse}"

docker_cmd() {
  "${DOCKER_BIN}" "$@"
}

sorted_unique_ids() {
  sed '/^[[:space:]]*$/d' | sort -u
}

project_container_image_ids() {
  docker_cmd ps -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" | while IFS= read -r container_id; do
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

capture_rollback_set() {
  install -d -m 0700 "${RETENTION_DIR}"

  local temp_file
  temp_file="$(mktemp)"
  project_container_image_ids > "${temp_file}"
  mv "${temp_file}" "${ROLLBACK_IMAGE_IDS_FILE}"
  chmod 0600 "${ROLLBACK_IMAGE_IDS_FILE}"

  local retained_count
  retained_count="$(wc -l < "${ROLLBACK_IMAGE_IDS_FILE}" | tr -d ' ')"
  printf 'Captured %s rollback image ids in %s\n' "${retained_count}" "${ROLLBACK_IMAGE_IDS_FILE}"
}

cleanup_after_success() {
  install -d -m 0700 "${RETENTION_DIR}"

  docker_cmd container prune -f

  local keep_file all_images_file removable_file
  keep_file="$(mktemp)"
  all_images_file="$(mktemp)"
  removable_file="$(mktemp)"
  trap 'rm -f "${keep_file}" "${all_images_file}" "${removable_file}"' RETURN

  {
    all_container_image_ids
    if [ -f "${ROLLBACK_IMAGE_IDS_FILE}" ]; then
      cat "${ROLLBACK_IMAGE_IDS_FILE}"
    fi
  } | sorted_unique_ids > "${keep_file}"

  docker_cmd image ls --all --quiet --no-trunc | sorted_unique_ids > "${all_images_file}"
  comm -23 "${all_images_file}" "${keep_file}" > "${removable_file}"

  local removable_count
  removable_count="$(wc -l < "${removable_file}" | tr -d ' ')"
  printf 'Removing %s unused image ids; retaining current containers and one rollback set.\n' "${removable_count}"

  while IFS= read -r image_id; do
    [ -n "${image_id}" ] || continue
    docker_cmd image rm "${image_id}"
  done < "${removable_file}"

  docker_cmd builder prune -af
  docker_cmd network prune -f
  docker_cmd system df
}

case "${1:-}" in
  capture-rollback-set)
    capture_rollback_set
    ;;
  cleanup-after-success)
    cleanup_after_success
    ;;
  *)
    printf 'Usage: %s {capture-rollback-set|cleanup-after-success}\n' "$0" >&2
    exit 64
    ;;
esac
