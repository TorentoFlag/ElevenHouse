import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const scriptPath = resolve("deployment/server/materialize-chart-service-envs.sh");

function makeHarness() {
  const directory = mkdtempSync(join(tmpdir(), "elevenhouse-chart-service-envs-"));
  const envDirectory = join(directory, "env");
  mkdirSync(envDirectory, { recursive: true, mode: 0o700 });
  return {
    directory,
    source: join(envDirectory, ".env.production"),
    engine: join(envDirectory, ".env.chart-engine.production"),
    worker: join(envDirectory, ".env.chart-worker.production")
  };
}

function sourceEnv() {
  return [
    "DATABASE_URL=postgresql://elevenhouse:password@postgres:5432/elevenhouse",
    "REDIS_URL=redis://redis:6379/0",
    "CHART_ENGINE_BASE_URL=http://chart-engine:8012",
    "CHART_ENGINE_EXPECTED_EPHEMERIS=swiss-ephemeris",
    "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS=FLG_SWIEPH,FLG_SPEED",
    `CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION=sha256:${"a".repeat(64)}`,
    "CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS=110",
    "CHART_ENGINE_CALCULATION_CONCURRENCY=1",
    "CHART_WORKER_CALCULATION_TIMEOUT_MS=120000",
    "CHART_WORKER_HEALTH_PORT=3012",
    "CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS=1000",
    "CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE=25",
    "CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS=60000",
    "CHART_WORKER_BACKOFF_MS=1000",
    "CHART_WORKER_JITTER=0.5",
    "CHART_WORKER_CONCURRENCY=2",
    "CHART_WORKER_LEASE_MS=60000",
    "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS=5000",
    "CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS=30000",
    "CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE=100",
    "CHART_WORKER_TELEMETRY_INTERVAL_MS=30000",
    "ASTRO_CALENDAR_WORKER_ATTEMPTS=5",
    "UNRELATED_SECRET=must-not-reach-chart-containers"
  ].join("\n");
}

function materialize(harness) {
  return spawnSync("bash", [scriptPath], {
    cwd: resolve("."),
    env: {
      ...process.env,
      DEPLOY_DIR: harness.directory,
      SOURCE_ENV_FILE: harness.source,
      CHART_ENGINE_ENV_FILE: harness.engine,
      CHART_WORKER_ENV_FILE: harness.worker
    },
    encoding: "utf8"
  });
}

describe("chart service production environment materialization", () => {
  it("materializes the least-privilege engine and worker allowlists without leaking source-only keys", () => {
    const harness = makeHarness();
    writeFileSync(harness.source, `${sourceEnv()}\n`, { mode: 0o600 });

    const result = materialize(harness);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const engine = readFileSync(harness.engine, "utf8");
    const worker = readFileSync(harness.worker, "utf8");
    assert.match(engine, /^CHART_ENGINE_EXPECTED_EPHEMERIS=swiss-ephemeris$/m);
    assert.match(
      worker,
      /^DATABASE_URL=postgresql:\/\/elevenhouse:password@postgres:5432\/elevenhouse$/m
    );
    assert.match(worker, /^CHART_ENGINE_BASE_URL=http:\/\/chart-engine:8012$/m);
    assert.doesNotMatch(engine, /DATABASE_URL|REDIS_URL|UNRELATED_SECRET/);
    assert.doesNotMatch(worker, /UNRELATED_SECRET/);
    assert.equal(statSync(harness.engine).mode & 0o777, 0o600);
    assert.equal(statSync(harness.worker).mode & 0o777, 0o600);
  });

  it("fails closed on duplicate required keys and leaves existing generated files intact", () => {
    const harness = makeHarness();
    writeFileSync(harness.source, `${sourceEnv()}\nCHART_WORKER_LEASE_MS=90000\n`, {
      mode: 0o600
    });
    writeFileSync(harness.engine, "previous-engine\n", { mode: 0o600 });
    writeFileSync(harness.worker, "previous-worker\n", { mode: 0o600 });

    const result = materialize(harness);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CHART_SERVICE_ENV_REQUIRED_KEY_DUPLICATE:CHART_WORKER_LEASE_MS/);
    assert.doesNotMatch(`${result.stderr}\n${result.stdout}`, /must-not-reach-chart-containers/);
    assert.equal(readFileSync(harness.engine, "utf8"), "previous-engine\n");
    assert.equal(readFileSync(harness.worker, "utf8"), "previous-worker\n");
  });
});
