import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(".");
const gitignorePath = join(repositoryRoot, ".gitignore");
const deployWorkflowPath = join(repositoryRoot, ".github/workflows/deploy.yml");
const backendDockerfilePath = join(repositoryRoot, "deployment/docker/backend.Dockerfile");
const productionComposePath = join(repositoryRoot, "deployment/compose/compose.production.yml");
const backupScriptPath = join(repositoryRoot, "deployment/server/backup-postgres.sh");
const chartEphemerisPreflightPath = join(
  repositoryRoot,
  "deployment/server/preflight-chart-ephemeris.sh"
);
const productionProviderPreflightPath = join(
  repositoryRoot,
  "deployment/server/preflight-production-providers.sh"
);
const materializeServiceEnvsPath = join(
  repositoryRoot,
  "deployment/server/materialize-chart-service-envs.sh"
);
const chartEngineEnvTemplatePath = join(
  repositoryRoot,
  "deployment/env/.env.chart-engine.production.example"
);
const chartWorkerEnvTemplatePath = join(
  repositoryRoot,
  "deployment/env/.env.chart-worker.production.example"
);
const productionEnvTemplatePath = join(
  repositoryRoot,
  "deployment/env/.env.production.example"
);

const chartEngineEnvKeys = [
  "CHART_ENGINE_EXPECTED_EPHEMERIS",
  "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS",
  "CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION",
  "CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS",
  "CHART_ENGINE_CALCULATION_CONCURRENCY",
  "CHART_WORKER_CALCULATION_TIMEOUT_MS"
] as const;
const chartWorkerEnvKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "CHART_ENGINE_BASE_URL",
  "CHART_ENGINE_EXPECTED_EPHEMERIS",
  "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS",
  "CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION",
  "CHART_WORKER_HEALTH_PORT",
  "CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS",
  "CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE",
  "CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS",
  "CHART_WORKER_BACKOFF_MS",
  "CHART_WORKER_JITTER",
  "CHART_WORKER_CONCURRENCY",
  "CHART_WORKER_LEASE_MS",
  "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS",
  "CHART_WORKER_CALCULATION_TIMEOUT_MS",
  "CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS",
  "CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE",
  "CHART_WORKER_TELEMETRY_INTERVAL_MS",
  "ASTRO_CALENDAR_WORKER_ATTEMPTS"
] as const;

const temporaryDirectories = new Set<string>();

afterEach(() => {
  const expectedPrefix = join(tmpdir(), "elevenhouse-deploy-hardening-");
  for (const directory of temporaryDirectories) {
    expect(directory.startsWith(expectedPrefix)).toBe(true);
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

describe("production chart deployment hardening", () => {
  it("preflights the ledger, quiesces every database writer, and verifies zero client sessions before backup", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const stagedCompose =
      "docker compose --env-file env/.env.deploy.next -f compose/compose.production.yml.next";
    const liveCompose =
      "docker compose --env-file env/.env.deploy -f compose/compose.production.yml";
    const preflight = `${stagedCompose} run --rm -T db-baseline-preflight`;
    const stopWriters = `${liveCompose} stop --timeout 150 "\${DATABASE_WRITER_SERVICES[@]}"`;
    const sessionFence = "PRODUCTION_DATABASE_NOT_QUIESCED";
    const backup = "./backup-postgres.sh";
    const reset = "db:reset-production-prelaunch";
    const fullUp = `${liveCompose} up -d --wait --wait-timeout 180`;
    const expectedWriters = [
      "public-api",
      "astrologer-api",
      "admin-api",
      "workers",
      "payment-worker",
      "chart-worker",
      "notification-worker"
    ];

    expect(workflow).toContain(preflight);
    expect(workflow.indexOf(preflight)).toBeLessThan(workflow.indexOf(stopWriters));
    expect(workflow).toContain("DATABASE_WRITER_SERVICES=(");
    for (const writer of expectedWriters) expect(workflow).toContain(`            ${writer}`);
    expect(workflow).toContain(stopWriters);
    expect(workflow).toContain(sessionFence);
    expect(workflow.indexOf(stopWriters)).toBeLessThan(workflow.indexOf(sessionFence));
    expect(workflow.indexOf(sessionFence)).toBeLessThan(workflow.indexOf(backup));
    expect(workflow.indexOf(backup)).toBeLessThan(workflow.indexOf(reset));
    expect(workflow.indexOf(reset)).toBeLessThan(workflow.indexOf(fullUp));
  });

  it("starts and health-gates PostgreSQL, then publishes a verified backup before mutable infrastructure", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const compose = "docker compose --env-file env/.env.deploy -f compose/compose.production.yml";
    const postgresStart = `${compose} up -d --no-recreate --wait --wait-timeout 120 postgres`;
    const backup = "./backup-postgres.sh";
    const mutableInfrastructureStart = `${compose} up -d --wait --wait-timeout 120 postgres redis minio`;

    expect(workflow).toContain("set -euo pipefail");
    expect(workflow).toContain(postgresStart);
    expect(workflow).not.toContain(
      `if ${compose} ps --services --status running | grep -qx postgres`
    );
    expect(workflow.indexOf(postgresStart)).toBeLessThan(workflow.indexOf(backup));
    expect(workflow.indexOf(backup)).toBeLessThan(workflow.indexOf(mutableInfrastructureStart));
    expect(workflow.indexOf(backup)).toBeLessThan(workflow.indexOf(mutableInfrastructureStart));
  });

  it("runs the real production chart smoke after all services are healthy and before artifact cleanup", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const backendDockerfile = readFileSync(backendDockerfilePath, "utf8");
    const fullUp = "up -d --wait --wait-timeout 180";
    const chartSmoke = "node apps/astrologer-api/scripts/chart-engine-smoke.mjs";
    const artifactCleanup = "./cleanup-docker-retention.sh cleanup-after-success";

    expect(workflow).toContain("CHART_SMOKE_ALLOW_PRODUCTION=true");
    expect(workflow).toContain("CHART_SMOKE_EXPECTED_DATABASE_HOST=postgres");
    expect(workflow).toContain("CHART_SMOKE_EXPECTED_DATABASE_NAME=elevenhouse");
    expect(workflow).toContain("CHART_SMOKE_API_BASE_URL=http://127.0.0.1:3002");
    expect(workflow).toContain("CHART_WORKER_BASE_URL=http://chart-worker:3012");
    expect(workflow).toContain("CHART_ENGINE_BASE_URL=http://chart-engine:8012");
    expect(workflow).toContain("CHART_SMOKE_ORIGIN=https://astrologer.elevenhouse.ai");
    expect(workflow).toContain(`astrologer-api ${chartSmoke}`);
    expect(workflow).not.toContain("astrologer-api pnpm");
    expect(backendDockerfile).toContain("COPY apps ./apps");
    expect(backendDockerfile).toContain("COPY --from=build /workspace /workspace");
    expect(workflow.indexOf(fullUp)).toBeLessThan(workflow.indexOf(chartSmoke));
    expect(workflow.indexOf(chartSmoke)).toBeLessThan(workflow.indexOf(artifactCleanup));
    expect(workflow).not.toMatch(/chart[^\n]*(?:mock|fake|moshier)/iu);
  });

  it("bounds every external production smoke request independently of the job deadline", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const smokeStep =
      workflow
        .split("      - name: Smoke check\n", 2)[1]
        ?.split("      - name: Cleanup production Docker artifacts\n", 1)[0] ?? "";
    const curlLines = smokeStep
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("curl "));

    expect(curlLines).toHaveLength(7);
    for (const line of curlLines) {
      expect(line).toContain("--connect-timeout 10");
      expect(line).toContain("--max-time 20");
      expect(line).toContain("--retry-max-time 120");
    }
  });

  it("budgets enough deploy-job time for bounded chart and external smoke deadlines", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const deployJob = workflow.split("\n  deploy:\n", 2)[1] ?? "";
    const timeoutMinutes = Number(deployJob.match(/^ {4}timeout-minutes: (\d+)$/mu)?.[1]);

    expect(timeoutMinutes).toBeGreaterThanOrEqual(30);
  });

  it("gives chart services only dedicated allowlisted environment files", () => {
    const compose = readFileSync(productionComposePath, "utf8");
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const chartWorker = serviceBlock(compose, "chart-worker", "chart-engine");
    const chartEngine = serviceBlock(compose, "chart-engine", "notification-worker");

    expect(chartWorker).toContain("path: ../env/.env.chart-worker.production");
    expect(chartWorker).toContain("format: raw");
    expect(chartWorker).not.toContain("../env/.env.production");
    expect(chartEngine).toContain("path: ../env/.env.chart-engine.production");
    expect(chartEngine).toContain("format: raw");
    expect(chartEngine).not.toContain("../env/.env.production");
    expect(workflow).toContain(
      'scp "${SSH_OPTS[@]}" deployment/server/materialize-chart-service-envs.sh'
    );
    expect(workflow).toContain('test "$(stat -c \'%a\' env/.env.chart-engine.production)" = "600"');
    expect(workflow).toContain('test "$(stat -c \'%a\' env/.env.chart-worker.production)" = "600"');
    expect(workflow.indexOf("./materialize-chart-service-envs.sh")).toBeLessThan(
      workflow.indexOf("docker compose --env-file env/.env.deploy")
    );
  });

  it("validates Compose compatibility and the staged config before replacing the live file", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const materialize = "./materialize-chart-service-envs.sh";
    const stagedDeployEnv = "cat > env/.env.deploy.next <<EOF";
    const configGate =
      "docker compose --env-file env/.env.deploy.next -f compose/compose.production.yml.next config --quiet";
    const bootstrap = "./cleanup-docker-retention.sh bootstrap-successful-release";
    const promoteCompose =
      "mv -- compose/compose.production.yml.next compose/compose.production.yml";
    const promoteDeployEnv = "mv -- env/.env.deploy.next env/.env.deploy";
    const pull =
      "docker compose --env-file env/.env.deploy.next -f compose/compose.production.yml.next pull";

    expect(workflow).toContain(
      'deployment/compose/compose.production.yml "${PRODUCTION_USER}@${PRODUCTION_HOST}:/opt/elevenhouse/compose/compose.production.yml.next"'
    );
    expect(workflow).toContain("COMPOSE_VERSION_UNSUPPORTED");
    expect(workflow).toContain(stagedDeployEnv);
    expect(workflow).toContain(configGate);
    expect(workflow).toContain(bootstrap);
    expect(workflow).toContain(promoteCompose);
    expect(workflow).toContain(promoteDeployEnv);
    expect(workflow.indexOf(materialize)).toBeLessThan(workflow.indexOf(stagedDeployEnv));
    expect(workflow.indexOf(stagedDeployEnv)).toBeLessThan(workflow.indexOf(configGate));
    expect(workflow.indexOf(configGate)).toBeLessThan(workflow.indexOf(bootstrap));
    expect(workflow.indexOf(bootstrap)).toBeLessThan(workflow.indexOf(pull));
    expect(workflow.indexOf(pull)).toBeLessThan(workflow.indexOf(promoteCompose));
    expect(workflow.indexOf(promoteCompose)).toBeLessThan(workflow.indexOf(promoteDeployEnv));
    expect(workflow).not.toContain("compose.production.yml.rollback");
    expect(workflow).not.toContain("capture-rollback-set");
  });

  it("validates the complete chart-worker runtime contract before PostgreSQL or schema mutation", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const stagedCompose =
      "docker compose --env-file env/.env.deploy.next -f compose/compose.production.yml.next";
    const liveCompose =
      "docker compose --env-file env/.env.deploy -f compose/compose.production.yml";
    const pull = `${stagedCompose} pull`;
    const runtimeValidation = `${stagedCompose} run --rm -T --no-deps chart-worker`;
    const promoteDeployEnv = "mv -- env/.env.deploy.next env/.env.deploy";
    const postgresStart = `${liveCompose} up -d --no-recreate --wait --wait-timeout 120 postgres`;
    const backup = "./backup-postgres.sh";

    expect(workflow).toContain(runtimeValidation);
    expect(workflow).toContain("node apps/chart-worker/dist/validate-startup-config.js");
    expect(workflow).not.toContain(
      "require('./apps/chart-worker/dist/runtime-config.js').createChartWorkerRuntimeConfig()"
    );
    expect(workflow.indexOf(pull)).toBeLessThan(workflow.indexOf(runtimeValidation));
    expect(workflow.indexOf(runtimeValidation)).toBeLessThan(workflow.indexOf(promoteDeployEnv));
    expect(workflow.indexOf(promoteDeployEnv)).toBeLessThan(workflow.indexOf(postgresStart));
    expect(workflow.indexOf(runtimeValidation)).toBeLessThan(workflow.indexOf(postgresStart));
    expect(workflow.indexOf(runtimeValidation)).toBeLessThan(workflow.indexOf(backup));
  });

  it("validates the admin finance WebAuthn runtime contract before PostgreSQL or schema mutation", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const productionEnvTemplate = readFileSync(productionEnvTemplatePath, "utf8");
    const stagedCompose =
      "docker compose --env-file env/.env.deploy.next -f compose/compose.production.yml.next";
    const runtimeValidation = `${stagedCompose} run --rm -T --no-deps admin-api`;
    const postgresStart = `${stagedCompose} up -d --no-recreate --wait --wait-timeout 120 postgres`;

    expect(productionEnvTemplate).toContain("ADMIN_API_FINANCE_WEBAUTHN_RP_ID=admin.elevenhouse.ai");
    expect(productionEnvTemplate).toContain("ADMIN_API_FINANCE_WEBAUTHN_ORIGIN=https://admin.elevenhouse.ai");
    expect(workflow).toContain(runtimeValidation);
    expect(workflow).toContain(
      "node -e \"require('./apps/admin-api/dist/config/runtime-config.js').createAdminApiRuntimeConfig(process.env)\""
    );
    expect(workflow.indexOf(runtimeValidation)).toBeLessThan(workflow.indexOf(postgresStart));
  });

  it("records immutable successful-release evidence only after internal and external smoke", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");
    const internalSmoke = "node apps/astrologer-api/scripts/chart-engine-smoke.mjs";
    const finalExternalSmoke = "https://admin.elevenhouse.ai/api/health";
    const record = './cleanup-docker-retention.sh record-successful-release "${RELEASE_ID}"';
    const cleanup = "./cleanup-docker-retention.sh cleanup-after-success";

    expect(workflow).toContain(record);
    expect(workflow.indexOf(internalSmoke)).toBeLessThan(workflow.indexOf(finalExternalSmoke));
    expect(workflow.indexOf(finalExternalSmoke)).toBeLessThan(workflow.indexOf(record));
    expect(workflow.indexOf(record)).toBeLessThan(workflow.indexOf(cleanup));
  });

  it("pins every third-party infrastructure image to a verified immutable manifest", () => {
    const compose = readFileSync(productionComposePath, "utf8");
    const expectedImages = [
      "caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648",
      "postgres:17.10-alpine3.24@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193",
      "redis:8.10.0-alpine@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241",
      "quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e",
      "quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727"
    ];

    for (const image of expectedImages) expect(compose).toContain(`image: ${image}`);
    for (const service of ["caddy", "postgres", "redis", "minio", "minio-init"]) {
      expect(serviceBlockByIndent(compose, service)).toMatch(
        /image: [^\n]+@sha256:[a-f0-9]{64}$/mu
      );
      expect(serviceBlockByIndent(compose, service)).not.toContain(":latest");
    }
  });

  it("gives chart-worker a shutdown window longer than its bounded close path and health probes", () => {
    const compose = readFileSync(productionComposePath, "utf8");
    const preflight = readFileSync(chartEphemerisPreflightPath, "utf8");
    const chartWorker = serviceBlock(compose, "chart-worker", "chart-engine");
    const chartEngine = serviceBlock(compose, "chart-engine", "notification-worker");

    expect(chartWorker).toContain("stop_grace_period: 135s");
    expect(chartWorker).toContain("timeout: 10s");
    expect(chartWorker).toContain("retries: 6");
    expect(chartWorker).toContain("start_period: 30s");
    expect(chartEngine).toContain("timeout: 10s");
    expect(chartEngine).toContain("retries: 6");
    expect(chartEngine).toContain("start_period: 20s");
    expect(preflight).toContain(
      "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS_PRODUCTION_MAX_EXCEEDED"
    );
    expect(preflight).toContain("CHART_WORKER_STORAGE_TIMEOUT_LEASE_MARGIN_INVALID");
  });

  it("keeps service-specific environment templates exact and secret-minimal", () => {
    const gitignore = readFileSync(gitignorePath, "utf8");

    expectEnvTemplate(chartEngineEnvTemplatePath, chartEngineEnvKeys);
    expectEnvTemplate(chartWorkerEnvTemplatePath, chartWorkerEnvKeys);
    expect(gitignore).toContain("!deployment/env/.env.chart-engine.production.example");
    expect(gitignore).toContain("!deployment/env/.env.chart-worker.production.example");
  });

  it("loads the baseline identity from the db-migrator package working directory", () => {
    const result = spawnSync(
      "pnpm",
      [
        "--dir",
        "packages/db",
        "exec",
        "tsx",
        "-e",
        "import('./scripts/production-baseline-plan.ts').then((module) => console.log(JSON.stringify(module.currentBaseline ?? module.default?.currentBaseline)))"
      ],
      { cwd: repositoryRoot, encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"hash"');
    expect(result.stdout).toContain('"createdAt"');
  });
});

describe("chart service environment materialization", () => {
  it("atomically writes only the two exact allowlists without printing unrelated secrets", () => {
    const harness = createDeployHarness();
    const secret = "must-not-leak-openai-secret";
    const literalDatabaseUrl = "postgresql://elevenhouse:pa$$word@postgres:5432/elevenhouse";
    const allowlistedLines = environmentLines([
      ...new Set([...chartEngineEnvKeys, ...chartWorkerEnvKeys])
    ]).map((line) =>
      line.startsWith("DATABASE_URL=") ? `DATABASE_URL=${literalDatabaseUrl}` : line
    );
    writeFileSync(
      harness.sourceEnv,
      [
        ...allowlistedLines,
        `ASTROLOGER_OPENAI_API_KEY=${secret}`,
        "AUTH_CODE_DELIVERY_ENCRYPTION_KEY=must-not-leak-auth-secret"
      ].join("\n") + "\n"
    );

    const result = runMaterializer(harness);

    expect(result.status).toBe(0);
    expect(readEnvNames(harness.chartEngineEnv)).toEqual(chartEngineEnvKeys);
    expect(readEnvNames(harness.chartWorkerEnv)).toEqual(chartWorkerEnvKeys);
    expect(statSync(harness.chartEngineEnv).mode & 0o777).toBe(0o600);
    expect(statSync(harness.chartWorkerEnv).mode & 0o777).toBe(0o600);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    expect(readFileSync(harness.chartEngineEnv, "utf8")).not.toContain("OPENAI");
    expect(readFileSync(harness.chartWorkerEnv, "utf8")).not.toContain("OPENAI");
    expect(readFileSync(harness.chartWorkerEnv, "utf8")).toContain(
      `DATABASE_URL=${literalDatabaseUrl}`
    );
  });

  it("fails closed on a missing required key without replacing either prior file", () => {
    const harness = createDeployHarness();
    const sourceKeys = [...new Set([...chartEngineEnvKeys, ...chartWorkerEnvKeys])].filter(
      (key) => key !== "CHART_ENGINE_CALCULATION_CONCURRENCY"
    );
    writeFileSync(harness.sourceEnv, environmentLines(sourceKeys).join("\n") + "\n");
    writeFileSync(harness.chartEngineEnv, "prior-engine=true\n", { mode: 0o600 });
    writeFileSync(harness.chartWorkerEnv, "prior-worker=true\n", { mode: 0o600 });

    const result = runMaterializer(harness);

    expect(result.status).not.toBe(0);
    expect(readFileSync(harness.chartEngineEnv, "utf8")).toBe("prior-engine=true\n");
    expect(readFileSync(harness.chartWorkerEnv, "utf8")).toBe("prior-worker=true\n");
    expect(result.stderr).toContain("CHART_SERVICE_ENV_REQUIRED_KEY_MISSING");
  });

  it("fails closed on duplicate keys without exposing either value", () => {
    const harness = createDeployHarness();
    const secretOne = "duplicate-secret-one";
    const secretTwo = "duplicate-secret-two";
    writeFileSync(
      harness.sourceEnv,
      [
        ...environmentLines([...new Set([...chartEngineEnvKeys, ...chartWorkerEnvKeys])]),
        `DATABASE_URL=${secretOne}`,
        `DATABASE_URL=${secretTwo}`
      ].join("\n") + "\n"
    );

    const result = runMaterializer(harness);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretOne);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretTwo);
    expect(result.stderr).toContain("CHART_SERVICE_ENV_REQUIRED_KEY_DUPLICATE");
  });

  it("fails closed on an empty required value without replacing prior files", () => {
    const harness = createDeployHarness();
    const sourceLines = environmentLines([
      ...new Set([...chartEngineEnvKeys, ...chartWorkerEnvKeys])
    ]).map((line) =>
      line.startsWith("CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS=")
        ? "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS=   "
        : line
    );
    writeFileSync(harness.sourceEnv, `${sourceLines.join("\n")}\n`);
    writeFileSync(harness.chartEngineEnv, "prior-engine=true\n", { mode: 0o600 });
    writeFileSync(harness.chartWorkerEnv, "prior-worker=true\n", { mode: 0o600 });

    const result = runMaterializer(harness);

    expect(result.status).not.toBe(0);
    expect(readFileSync(harness.chartEngineEnv, "utf8")).toBe("prior-engine=true\n");
    expect(readFileSync(harness.chartWorkerEnv, "utf8")).toBe("prior-worker=true\n");
    expect(result.stderr).toContain("CHART_SERVICE_ENV_REQUIRED_KEY_EMPTY");
  });

  it("rejects raw-incompatible quoting, whitespace and inline comments before publication", () => {
    for (const incompatibleValue of [
      '"quoted-value"',
      "'quoted-value'",
      " leading-space",
      "trailing-space ",
      "value # inline-comment"
    ]) {
      const harness = createDeployHarness();
      const sourceLines = environmentLines([
        ...new Set([...chartEngineEnvKeys, ...chartWorkerEnvKeys])
      ]).map((line) =>
        line.startsWith("DATABASE_URL=") ? `DATABASE_URL=${incompatibleValue}` : line
      );
      writeFileSync(harness.sourceEnv, `${sourceLines.join("\n")}\n`);
      writeFileSync(harness.chartEngineEnv, "prior-engine=true\n", { mode: 0o600 });
      writeFileSync(harness.chartWorkerEnv, "prior-worker=true\n", { mode: 0o600 });

      const result = runMaterializer(harness);

      expect(result.status).not.toBe(0);
      expect(readFileSync(harness.chartEngineEnv, "utf8")).toBe("prior-engine=true\n");
      expect(readFileSync(harness.chartWorkerEnv, "utf8")).toBe("prior-worker=true\n");
      expect(result.stderr).toContain("CHART_SERVICE_ENV_REQUIRED_KEY_RAW_INCOMPATIBLE");
      expect(`${result.stdout}${result.stderr}`).not.toContain(incompatibleValue);
    }
  });
});

describe("production provider origin preflights", () => {
  it("rejects a non-canonical chart-engine origin before licensed artifact checks", () => {
    const harness = createDeployHarness();
    const productionExample = readFileSync(
      join(repositoryRoot, "deployment/env/.env.production.example"),
      "utf8"
    ).replace(
      /^CHART_ENGINE_BASE_URL=.*$/mu,
      "CHART_ENGINE_BASE_URL=http://chart-engine.attacker.internal:8012"
    );
    writeFileSync(harness.sourceEnv, productionExample);

    const result = spawnSync("bash", [chartEphemerisPreflightPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, DEPLOY_DIR: harness.directory }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CHART_ENGINE_BASE_URL_PRODUCTION_ORIGIN_INVALID");
    expect(`${result.stdout}${result.stderr}`).not.toContain("attacker.internal");
  });

  it("rejects alternate HTTPS Geoapify origins for both production API providers", () => {
    for (const prefix of ["PUBLIC_API", "ASTROLOGER_API"]) {
      const harness = createDeployHarness();
      const productionExample = readFileSync(
        join(repositoryRoot, "deployment/env/.env.production.example"),
        "utf8"
      )
        .replace(
          /^(PUBLIC_API|ASTROLOGER_API)_GEOAPIFY_API_KEY=.*$/gmu,
          "$1_GEOAPIFY_API_KEY=verified-test-key"
        )
        .replace(
          new RegExp(`^${prefix}_GEOAPIFY_BASE_URL=.*$`, "mu"),
          `${prefix}_GEOAPIFY_BASE_URL=https://geoapify-compatible.attacker`
        );
      writeFileSync(harness.sourceEnv, productionExample);

      const result = spawnSync("bash", [productionProviderPreflightPath], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, DEPLOY_DIR: harness.directory }
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`${prefix}_GEOAPIFY_BASE_URL_OFFICIAL_ORIGIN_REQUIRED`);
      expect(`${result.stdout}${result.stderr}`).not.toContain("geoapify-compatible.attacker");
    }
  });
});

describe("verified PostgreSQL backup publication", () => {
  it("fully verifies a non-empty custom archive before publishing it atomically", () => {
    const harness = createDeployHarness();
    const result = runBackup(harness, "valid");
    const backupFiles = readdirSync(harness.backupDir).filter((name) => name.endsWith(".dump"));

    expect(result.status).toBe(0);
    expect(backupFiles).toHaveLength(1);
    expect(readdirSync(harness.backupDir).some((name) => name.includes(".dump.partial."))).toBe(
      false
    );
    expect(backupFiles[0]).not.toContain("XXXXXX");
    expect(readFileSync(backupScriptPath, "utf8")).toContain(
      'mktemp "${BACKUP_DIR}/elevenhouse-${STAMP}.dump.partial.XXXXXX"'
    );
    expect(statSync(join(harness.backupDir, backupFiles[0]!)).mode & 0o777).toBe(0o600);
    expect(readFileSync(harness.dockerLog, "utf8")).toMatch(
      /pg_dump[\s\S]+pg_restore --list[\s\S]+pg_restore --exit-on-error --file=\/dev\/null/u
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(harness.secret);
  });

  it("removes an invalid partial archive and never publishes it", () => {
    const harness = createDeployHarness();
    const result = runBackup(harness, "invalid-stream");

    expect(result.status).not.toBe(0);
    expect(readdirSync(harness.backupDir).filter((name) => name.endsWith(".dump"))).toEqual([]);
    expect(
      readdirSync(harness.backupDir).filter((name) => name.includes(".dump.partial."))
    ).toEqual([]);
    expect(`${result.stdout}${result.stderr}`).not.toContain(harness.secret);
  });

  it("rejects an empty dump before archive verification or publication", () => {
    const harness = createDeployHarness();
    const result = runBackup(harness, "empty-stream");

    expect(result.status).not.toBe(0);
    expect(readdirSync(harness.backupDir).filter((name) => name.endsWith(".dump"))).toEqual([]);
    expect(
      readdirSync(harness.backupDir).filter((name) => name.includes(".dump.partial."))
    ).toEqual([]);
    expect(readFileSync(harness.dockerLog, "utf8")).not.toContain("pg_restore");
  });

  it("publishes distinct archives when two verified backups start in the same second", () => {
    const harness = createDeployHarness();

    const first = runBackup(harness, "valid");
    const second = runBackup(harness, "valid");
    const backupFiles = readdirSync(harness.backupDir).filter((name) => name.endsWith(".dump"));

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(backupFiles).toHaveLength(2);
    expect(new Set(backupFiles).size).toBe(2);
    expect(backupFiles.every((name) => !name.includes("XXXXXX"))).toBe(true);
  });
});

function serviceBlock(source: string, service: string, nextService: string): string {
  return source.split(`\n  ${service}:\n`, 2)[1]?.split(`\n  ${nextService}:\n`, 1)[0] ?? "";
}

function serviceBlockByIndent(source: string, service: string): string {
  const start = source.indexOf(`\n  ${service}:\n`);
  if (start < 0) return "";
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/u);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function expectEnvTemplate(path: string, expectedKeys: readonly string[]): void {
  let source = "";
  expect(() => {
    source = readFileSync(path, "utf8");
  }).not.toThrow();
  if (!source) return;
  expect(readEnvNamesFromSource(source)).toEqual(expectedKeys);
  expect(source).not.toMatch(
    /(?:OPENAI|PASSWORD|SECRET|TOKEN|MINIO|AUTH_CODE|TELEGRAM|INSTAGRAM)/u
  );
}

function createDeployHarness() {
  const directory = mkdtempSync(join(tmpdir(), "elevenhouse-deploy-hardening-"));
  temporaryDirectories.add(directory);
  const envDir = join(directory, "env");
  const composeDir = join(directory, "compose");
  const backupDir = join(directory, "backups/postgres");
  mkdirSync(envDir, { recursive: true });
  mkdirSync(composeDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(join(composeDir, "compose.production.yml"), "services: {}\n");
  writeFileSync(join(envDir, ".env.deploy"), "IMAGE_TAG=test\n");

  const fakeDocker = join(directory, "docker");
  const fakeDate = join(directory, "date");
  const dockerLog = join(directory, "docker.log");
  const secret = "must-not-leak-postgres-secret";
  writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  *pg_dump*)
    if [ "$FAKE_DOCKER_MODE" != "empty-stream" ]; then
      printf 'verified-custom-archive'
    fi
    ;;
  *"pg_restore --list"*)
    cat >/dev/null
    ;;
  *"pg_restore --exit-on-error --file=/dev/null"*)
    cat >/dev/null
    if [ "$FAKE_DOCKER_MODE" = "invalid-stream" ]; then exit 42; fi
    ;;
  *)
    printf 'UNHANDLED_FAKE_DOCKER_COMMAND\\n' >&2
    exit 64
    ;;
esac
`
  );
  chmodSync(fakeDocker, 0o700);
  writeFileSync(fakeDate, "#!/usr/bin/env bash\nprintf '20260803T000000Z\\n'\n");
  chmodSync(fakeDate, 0o700);

  return {
    directory,
    envDir,
    sourceEnv: join(envDir, ".env.production"),
    chartEngineEnv: join(envDir, ".env.chart-engine.production"),
    chartWorkerEnv: join(envDir, ".env.chart-worker.production"),
    backupDir,
    fakeDocker,
    fakeDate,
    dockerLog,
    secret
  };
}

function runMaterializer(harness: ReturnType<typeof createDeployHarness>) {
  return spawnSync("bash", [materializeServiceEnvsPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SOURCE_ENV_FILE: harness.sourceEnv,
      CHART_ENGINE_ENV_FILE: harness.chartEngineEnv,
      CHART_WORKER_ENV_FILE: harness.chartWorkerEnv
    }
  });
}

function runBackup(harness: ReturnType<typeof createDeployHarness>, mode: string) {
  return spawnSync("bash", [backupScriptPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DEPLOY_DIR: harness.directory,
      BACKUP_DIR: harness.backupDir,
      DOCKER_BIN: harness.fakeDocker,
      FAKE_DOCKER_LOG: harness.dockerLog,
      FAKE_DOCKER_MODE: mode,
      PATH: `${harness.directory}:${process.env.PATH ?? ""}`,
      DATABASE_URL: `postgresql://elevenhouse:${harness.secret}@postgres:5432/elevenhouse`
    }
  });
}

function environmentLines(keys: readonly string[]): string[] {
  return keys.map((key, index) => `${key}=value-${index + 1}`);
}

function readEnvNames(path: string): string[] {
  return readEnvNamesFromSource(readFileSync(path, "utf8"));
}

function readEnvNamesFromSource(source: string): string[] {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")));
}
