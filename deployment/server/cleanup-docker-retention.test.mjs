import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const scriptPath = resolve("deployment/server/cleanup-docker-retention.sh");
const previousImageTag = "5".repeat(40);
const failedImageTag = "6".repeat(40);
const currentImageTag = "7".repeat(40);
const imageIds = {
  previousApi: `sha256:${"a".repeat(64)}`,
  previousWeb: `sha256:${"b".repeat(64)}`,
  previousStoppedPostgres: `sha256:${"c".repeat(64)}`,
  failedApi: `sha256:${"d".repeat(64)}`,
  failedWeb: `sha256:${"e".repeat(64)}`,
  currentApi: `sha256:${"f".repeat(64)}`,
  currentWeb: `sha256:${"1".repeat(64)}`,
  caddy: `sha256:${"2".repeat(64)}`,
  oldA: `sha256:${"3".repeat(64)}`,
  oldB: `sha256:${"4".repeat(64)}`
};

function makeHarness() {
  const directory = mkdtempSync(join(tmpdir(), "elevenhouse-retention-"));
  mkdirSync(join(directory, "compose"), { recursive: true });
  mkdirSync(join(directory, "env"), { recursive: true });
  writeFileSync(join(directory, "compose", "compose.production.yml"), "services: {}\n");
  writeFileSync(
    join(directory, "env", ".env.deploy"),
    `IMAGE_NAMESPACE=ghcr.io/torentoflag\nIMAGE_TAG=${previousImageTag}\nCOMPOSE_PROJECT_NAME=elevenhouse\n`
  );

  const fakeDocker = join(directory, "docker");
  const logFile = join(directory, "docker.log");
  writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"

if [ "$1" = "inspect" ]; then
  case "$4" in
    previous-api) echo ${imageIds.previousApi} ;;
    previous-web) echo ${imageIds.previousWeb} ;;
    previous-stopped-postgres) echo ${imageIds.previousStoppedPostgres} ;;
    failed-api) echo ${imageIds.failedApi} ;;
    failed-web) echo ${imageIds.failedWeb} ;;
    current-api) echo ${imageIds.currentApi} ;;
    current-web) echo ${imageIds.currentWeb} ;;
    caddy) echo ${imageIds.caddy} ;;
    *) exit 1 ;;
  esac
  exit 0
fi

if [ "$1" = "ps" ] && [ "$2" = "-q" ]; then
  if [ "$FAKE_DOCKER_STATE" = "before" ]; then
    printf '%s\\n' previous-api previous-web
  elif [ "$FAKE_DOCKER_STATE" = "failed" ]; then
    printf '%s\\n' failed-api failed-web
  else
    printf '%s\\n' current-api current-web
  fi
  exit 0
fi

if [ "$1" = "ps" ] && [ "$2" = "-aq" ]; then
  if [ "\${3:-}" = "--filter" ]; then
    if [ "$FAKE_DOCKER_STATE" = "before" ]; then
      printf '%s\\n' previous-api previous-web previous-stopped-postgres
    elif [ "$FAKE_DOCKER_STATE" = "failed" ]; then
      printf '%s\\n' failed-api failed-web
    else
      printf '%s\\n' current-api current-web
    fi
    exit 0
  fi
  printf '%s\\n' current-api current-web caddy
  exit 0
fi

if [ "$1" = "image" ] && [ "$2" = "ls" ]; then
  printf '%s\\n' ${imageIds.currentApi} ${imageIds.currentWeb} ${imageIds.previousApi} ${imageIds.previousWeb} ${imageIds.previousStoppedPostgres} ${imageIds.failedApi} ${imageIds.failedWeb} ${imageIds.caddy} ${imageIds.oldA} ${imageIds.oldB}
  exit 0
fi

if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
  exit 0
fi

if [ "$1" = "container" ] && [ "$2" = "prune" ]; then
  echo "container prune"
  exit 0
fi

if [ "$1" = "builder" ] && [ "$2" = "prune" ]; then
  echo "builder prune"
  exit 0
fi

if [ "$1" = "network" ] && [ "$2" = "prune" ]; then
  echo "network prune"
  exit 0
fi

if [ "$1" = "system" ] && [ "$2" = "df" ]; then
  echo "system df"
  exit 0
fi

echo "Unhandled fake docker command: $*" >&2
exit 1
`
  );
  chmodSync(fakeDocker, 0o755);

  return { directory, fakeDocker, logFile };
}

function spawnScript(harness, command, state, releaseId) {
  const args = releaseId === undefined ? [scriptPath, command] : [scriptPath, command, releaseId];
  return spawnSync("bash", args, {
    cwd: resolve("."),
    env: {
      ...process.env,
      DEPLOY_DIR: harness.directory,
      DOCKER_BIN: harness.fakeDocker,
      FAKE_DOCKER_LOG: harness.logFile,
      FAKE_DOCKER_STATE: state
    },
    encoding: "utf8"
  });
}

function runScript(harness, command, state, releaseId) {
  const result = spawnScript(harness, command, state, releaseId);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

describe("production Docker cleanup retention", () => {
  it("preserves the last successful release through failed retries and rotates only after smoke", () => {
    const harness = makeHarness();

    runScript(harness, "bootstrap-successful-release", "before");
    const successfulReleaseLog = join(harness.directory, "retention", "successful-releases.log");
    const bootstrapRelease = readFileSync(successfulReleaseLog, "utf8").trim();
    const bootstrapDirectory = join(
      harness.directory,
      "retention",
      "successful-releases",
      bootstrapRelease
    );
    const rollbackIds = readFileSync(join(bootstrapDirectory, "image-ids.txt"), "utf8")
      .trim()
      .split("\n");

    assert.deepEqual(rollbackIds, [
      imageIds.previousApi,
      imageIds.previousWeb,
      imageIds.previousStoppedPostgres
    ]);
    assert.equal(
      readFileSync(join(bootstrapDirectory, "compose.production.yml"), "utf8"),
      "services: {}\n"
    );
    assert.equal(
      readFileSync(join(bootstrapDirectory, "env.deploy"), "utf8"),
      `IMAGE_NAMESPACE=ghcr.io/torentoflag\nIMAGE_TAG=${previousImageTag}\nCOMPOSE_PROJECT_NAME=elevenhouse\n`
    );

    writeFileSync(
      join(harness.directory, "compose", "compose.production.yml"),
      "services:\n  failed: {}\n"
    );
    writeFileSync(
      join(harness.directory, "env", ".env.deploy"),
      `IMAGE_NAMESPACE=ghcr.io/torentoflag\nIMAGE_TAG=${failedImageTag}\nCOMPOSE_PROJECT_NAME=elevenhouse\n`
    );
    runScript(harness, "bootstrap-successful-release", "failed");
    assert.equal(readFileSync(successfulReleaseLog, "utf8").trim(), bootstrapRelease);
    assert.equal(
      readFileSync(join(bootstrapDirectory, "compose.production.yml"), "utf8"),
      "services: {}\n"
    );
    assert.equal(
      readFileSync(join(bootstrapDirectory, "env.deploy"), "utf8"),
      `IMAGE_NAMESPACE=ghcr.io/torentoflag\nIMAGE_TAG=${previousImageTag}\nCOMPOSE_PROJECT_NAME=elevenhouse\n`
    );

    writeFileSync(
      join(harness.directory, "compose", "compose.production.yml"),
      "services:\n  current: {}\n"
    );
    writeFileSync(
      join(harness.directory, "env", ".env.deploy"),
      `IMAGE_NAMESPACE=ghcr.io/torentoflag\nIMAGE_TAG=${currentImageTag}\nCOMPOSE_PROJECT_NAME=elevenhouse\n`
    );
    runScript(harness, "record-successful-release", "after", "sha-run-2");
    assert.deepEqual(readFileSync(successfulReleaseLog, "utf8").trim().split("\n"), [
      bootstrapRelease,
      "sha-run-2"
    ]);
    assert.equal(
      readFileSync(
        join(
          harness.directory,
          "retention",
          "successful-releases",
          "sha-run-2",
          "compose.production.yml"
        ),
        "utf8"
      ),
      "services:\n  current: {}\n"
    );
    assert.equal(
      readFileSync(
        join(harness.directory, "retention", "successful-releases", "sha-run-2", "env.deploy"),
        "utf8"
      ),
      `IMAGE_NAMESPACE=ghcr.io/torentoflag\nIMAGE_TAG=${currentImageTag}\nCOMPOSE_PROJECT_NAME=elevenhouse\n`
    );

    runScript(harness, "cleanup-after-success", "after");
    const log = readFileSync(harness.logFile, "utf8");

    assert.match(log, /ps -aq --filter label=com\.docker\.compose\.project=elevenhouse/);
    assert.match(log, /container prune -f/);
    assert.match(log, new RegExp(`image rm ${imageIds.oldA}`));
    assert.match(log, new RegExp(`image rm ${imageIds.oldB}`));
    assert.doesNotMatch(log, new RegExp(`image rm ${imageIds.currentApi}`));
    assert.doesNotMatch(log, new RegExp(`image rm ${imageIds.currentWeb}`));
    assert.doesNotMatch(log, new RegExp(`image rm ${imageIds.previousApi}`));
    assert.doesNotMatch(log, new RegExp(`image rm ${imageIds.previousWeb}`));
    assert.doesNotMatch(log, new RegExp(`image rm ${imageIds.previousStoppedPostgres}`));
    assert.match(log, new RegExp(`image rm ${imageIds.failedApi}`));
    assert.match(log, new RegExp(`image rm ${imageIds.failedWeb}`));
    assert.match(log, /builder prune -af/);
    assert.match(log, /network prune -f/);
    assert.doesNotMatch(log, /volume prune/);
    assert.doesNotMatch(log, /system prune/);
  });

  it("fails closed before Docker deletion when successful-release image evidence is invalid", () => {
    const harness = makeHarness();
    runScript(harness, "bootstrap-successful-release", "before");
    const successfulReleaseLog = join(harness.directory, "retention", "successful-releases.log");
    const bootstrapRelease = readFileSync(successfulReleaseLog, "utf8").trim();
    writeFileSync(
      join(
        harness.directory,
        "retention",
        "successful-releases",
        bootstrapRelease,
        "image-ids.txt"
      ),
      "--force\n"
    );

    const result = spawnScript(harness, "cleanup-after-success", "after");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SUCCESSFUL_RELEASE_IMAGE_SET_INVALID/);
    const log = readFileSync(harness.logFile, "utf8");
    assert.doesNotMatch(log, /container prune/);
    assert.doesNotMatch(log, /image rm/);
  });
});
