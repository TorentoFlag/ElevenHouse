#!/usr/bin/env bash
set -euo pipefail

require_rootless_docker=false
if [ "${1:-}" = "--require-rootless-docker" ]; then
  require_rootless_docker=true
fi

if [ "$(id -u)" = "0" ]; then
  printf '%s\n' "SELF_HOSTED_RUNNER_MUST_NOT_RUN_AS_ROOT" >&2
  exit 1
fi

if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  printf '%s\n' "SELF_HOSTED_RUNNER_MUST_NOT_HAVE_PASSWORDLESS_SUDO" >&2
  exit 1
fi

case "${GITHUB_WORKSPACE:-}" in
  /opt/* | /root/* | /)
    printf 'SELF_HOSTED_RUNNER_WORKSPACE_FORBIDDEN path=%s\n' "${GITHUB_WORKSPACE:-}" >&2
    exit 1
    ;;
esac

if [ "${require_rootless_docker}" = true ]; then
  if ! command -v docker >/dev/null 2>&1; then
    printf '%s\n' "ROOTLESS_DOCKER_REQUIRED_BUT_DOCKER_MISSING" >&2
    exit 1
  fi
  if ! docker info --format '{{json .SecurityOptions}}' | grep -qi rootless; then
    printf '%s\n' "ROOTLESS_DOCKER_REQUIRED_FOR_SELF_HOSTED_BUILDS" >&2
    exit 1
  fi
fi
