import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const scriptPath = resolve("deployment/server/backup-postgres.sh");

function makeHarness({ failVerification = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "elevenhouse-postgres-backup-"));
  const backupDirectory = join(directory, "backups");
  const fakeDocker = join(directory, "docker");
  const dockerLog = join(directory, "docker.log");
  writeFileSync(join(directory, "compose.yml"), "services: {}\n");
  writeFileSync(join(directory, "deploy.env"), "COMPOSE_PROJECT_NAME=elevenhouse\n");
  writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  *'pg_dump -U'*) printf 'safe-postgresql-custom-dump\\n' ;;
  *'pg_restore --list'*) ${failVerification ? "exit 31" : "cat >/dev/null"} ;;
  *'pg_restore --exit-on-error'*) cat >/dev/null ;;
  *) printf '%s\\n' 'unexpected fake docker invocation' >&2; exit 32 ;;
esac
`
  );
  chmodSync(fakeDocker, 0o755);
  return { backupDirectory, directory, dockerLog, fakeDocker };
}

function backup(harness) {
  return spawnSync("bash", [scriptPath], {
    cwd: resolve("."),
    env: {
      ...process.env,
      BACKUP_DIR: harness.backupDirectory,
      COMPOSE_FILE: join(harness.directory, "compose.yml"),
      ENV_FILE: join(harness.directory, "deploy.env"),
      DOCKER_BIN: harness.fakeDocker,
      FAKE_DOCKER_LOG: harness.dockerLog
    },
    encoding: "utf8"
  });
}

describe("production PostgreSQL backup", () => {
  it("publishes only a verified custom-format dump after both restore checks", () => {
    const harness = makeHarness();
    const result = backup(harness);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const files = readdirSync(harness.backupDirectory);
    assert.equal(files.filter((file) => file.endsWith(".dump")).length, 1);
    assert.equal(files.filter((file) => file.includes(".partial.")).length, 0);
    const log = readFileSync(harness.dockerLog, "utf8");
    assert.match(log, /pg_dump -U/);
    assert.match(log, /pg_restore --list/);
    assert.match(log, /pg_restore --exit-on-error --file=\/dev\/null/);
  });

  it("removes a failed provisional dump instead of publishing an unverified backup", () => {
    const harness = makeHarness({ failVerification: true });
    const result = backup(harness);

    assert.notEqual(result.status, 0);
    assert.equal(readdirSync(harness.backupDirectory).length, 0);
  });
});
