import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const scriptPath = resolve("deployment/server/cleanup-docker-retention.sh");

function makeHarness() {
  const directory = mkdtempSync(join(tmpdir(), "elevenhouse-retention-"));
  mkdirSync(join(directory, "compose"), { recursive: true });
  mkdirSync(join(directory, "env"), { recursive: true });
  writeFileSync(join(directory, "compose", "compose.production.yml"), "services: {}\n");
  writeFileSync(join(directory, "env", ".env.deploy"), "IMAGE_TAG=previous\n");

  const fakeDocker = join(directory, "docker");
  const logFile = join(directory, "docker.log");
  writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"

if [ "$1" = "inspect" ]; then
  case "$4" in
    previous-api) echo sha256:previous-api ;;
    previous-web) echo sha256:previous-web ;;
    current-api) echo sha256:current-api ;;
    current-web) echo sha256:current-web ;;
    caddy) echo sha256:caddy ;;
    *) exit 1 ;;
  esac
  exit 0
fi

if [ "$1" = "ps" ] && [ "$2" = "-q" ]; then
  if [ "$FAKE_DOCKER_STATE" = "before" ]; then
    printf '%s\\n' previous-api previous-web
  else
    printf '%s\\n' current-api current-web
  fi
  exit 0
fi

if [ "$1" = "ps" ] && [ "$2" = "-aq" ]; then
  printf '%s\\n' current-api current-web caddy
  exit 0
fi

if [ "$1" = "image" ] && [ "$2" = "ls" ]; then
  printf '%s\\n' sha256:current-api sha256:current-web sha256:previous-api sha256:previous-web sha256:caddy sha256:old-a sha256:old-b
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

function runScript(harness, command, state) {
  const result = spawnSync("bash", [scriptPath, command], {
    cwd: resolve("."),
    env: {
      ...process.env,
      DEPLOY_DIR: harness.directory,
      DOCKER_BIN: harness.fakeDocker,
      FAKE_DOCKER_LOG: harness.logFile,
      FAKE_DOCKER_STATE: state,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

describe("production Docker cleanup retention", () => {
  it("captures the pre-deploy image set and retains it during post-smoke cleanup", () => {
    const harness = makeHarness();

    runScript(harness, "capture-rollback-set", "before");
    const rollbackIds = readFileSync(
      join(harness.directory, "retention", "rollback-image-ids.txt"),
      "utf8"
    ).trim().split("\n");

    assert.deepEqual(rollbackIds, ["sha256:previous-api", "sha256:previous-web"]);

    runScript(harness, "cleanup-after-success", "after");
    const log = readFileSync(harness.logFile, "utf8");

    assert.match(log, /container prune -f/);
    assert.match(log, /image rm sha256:old-a/);
    assert.match(log, /image rm sha256:old-b/);
    assert.doesNotMatch(log, /image rm sha256:current-api/);
    assert.doesNotMatch(log, /image rm sha256:current-web/);
    assert.doesNotMatch(log, /image rm sha256:previous-api/);
    assert.doesNotMatch(log, /image rm sha256:previous-web/);
    assert.match(log, /builder prune -af/);
    assert.match(log, /network prune -f/);
    assert.doesNotMatch(log, /volume prune/);
    assert.doesNotMatch(log, /system prune/);
  });
});
