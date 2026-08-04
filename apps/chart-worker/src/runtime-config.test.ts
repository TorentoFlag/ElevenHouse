import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createChartWorkerRuntimeConfig } from "./runtime-config";

describe("createChartWorkerRuntimeConfig", () => {
  it("keeps chart retry authority out of runtime config and exposes bounded lease controls", () => {
    const config = createChartWorkerRuntimeConfig({ CHART_WORKER_ATTEMPTS: "10" });

    expect(config).not.toHaveProperty("attempts");
    expect(config).toMatchObject({
      leaseMs: 60_000,
      storageOperationTimeoutMs: 5_000,
      calculationTimeoutMs: 120_000,
      exhaustedSweepIntervalMs: 30_000,
      exhaustedSweepBatchSize: 100,
      telemetryIntervalMs: 30_000,
      astroCalendarAttempts: 5
    });
  });

  it("requires explicit production lease/timeout/sweep values but not CHART_WORKER_ATTEMPTS", () => {
    const config = createChartWorkerRuntimeConfig({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://elevenhouse:verified-production-password@postgres:5432/elevenhouse",
      REDIS_URL: "rediss://redis.internal:6379",
      CHART_ENGINE_BASE_URL: "http://chart-engine:8012",
      CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS: "1000",
      CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE: "25",
      CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS: "60000",
      CHART_WORKER_BACKOFF_MS: "1000",
      CHART_WORKER_JITTER: "0.5",
      CHART_WORKER_CONCURRENCY: "2",
      CHART_WORKER_LEASE_MS: "60000",
      CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS: "5000",
      CHART_WORKER_CALCULATION_TIMEOUT_MS: "120000",
      CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS: "30000",
      CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE: "100",
      CHART_WORKER_TELEMETRY_INTERVAL_MS: "30000",
      ASTRO_CALENDAR_WORKER_ATTEMPTS: "5"
    });

    expect(config).not.toHaveProperty("attempts");
    expect(config.databaseUrl).toBe(
      "postgresql://elevenhouse:verified-production-password@postgres:5432/elevenhouse"
    );
    expect(config.leaseMs).toBe(60_000);
    expect(config.storageOperationTimeoutMs).toBe(5_000);
    expect(config.astroCalendarAttempts).toBe(5);
  });

  it("rejects a lease too short to heartbeat before half of its duration", () => {
    expect(() => createChartWorkerRuntimeConfig({ CHART_WORKER_LEASE_MS: "999" })).toThrow();
  });

  it("rejects a storage deadline that cannot finish before the heartbeat safety boundary", () => {
    expect(() =>
      createChartWorkerRuntimeConfig({
        CHART_WORKER_LEASE_MS: "10000",
        CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS: "5000"
      })
    ).toThrow("CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS must be less than half the lease");
  });

  it("rejects a non-positive queue telemetry interval", () => {
    expect(() =>
      createChartWorkerRuntimeConfig({ CHART_WORKER_TELEMETRY_INTERVAL_MS: "0" })
    ).toThrow();
  });

  it("caps the production storage deadline below health and shutdown budgets", () => {
    expect(() =>
      createChartWorkerRuntimeConfig(
        productionRuntimeSource({ CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS: "5001" })
      )
    ).toThrow("CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS must not exceed 5000 in production");
  });

  it("rejects a bracketed IPv6 loopback Redis URL in production", () => {
    expect(() =>
      createChartWorkerRuntimeConfig(productionRuntimeSource({ REDIS_URL: "redis://[::1]:6379" }))
    ).toThrow("REDIS_URL must not use a loopback host in production");
  });

  it("rejects a bracketed IPv6 loopback chart engine URL in production", () => {
    expect(() =>
      createChartWorkerRuntimeConfig(
        productionRuntimeSource({ CHART_ENGINE_BASE_URL: "http://[::1]:8012" })
      )
    ).toThrow("CHART_ENGINE_BASE_URL must not use a loopback host in production");
  });

  it("rejects an arbitrary non-loopback chart engine origin in production", () => {
    expect(() =>
      createChartWorkerRuntimeConfig(
        productionRuntimeSource({
          CHART_ENGINE_BASE_URL: "http://chart-engine.attacker.internal:8012"
        })
      )
    ).toThrow("CHART_ENGINE_BASE_URL must equal http://chart-engine:8012 in production");
  });

  it("rejects a non-canonical production database target", () => {
    expect(() =>
      createChartWorkerRuntimeConfig(
        productionRuntimeSource({
          DATABASE_URL:
            "postgresql://elevenhouse:verified-production-password@postgres.attacker.internal:5432/elevenhouse"
        })
      )
    ).toThrow(
      "DATABASE_URL must target postgresql://elevenhouse@postgres:5432/elevenhouse in production"
    );
  });

  it("keeps the checked-in production environment example executable by chart-worker", () => {
    const source = parseEnvironmentExample(
      readFileSync("deployment/env/.env.production.example", "utf8")
    );

    expect(() =>
      createChartWorkerRuntimeConfig({ ...source, NODE_ENV: "production" })
    ).not.toThrow();
  });

  it("loads explicit production worker controls from the protected env file without compose defaults", () => {
    const compose = readFileSync("deployment/compose/compose.production.yml", "utf8");
    const requiredKeys = [
      "CHART_WORKER_LEASE_MS",
      "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS",
      "CHART_WORKER_CALCULATION_TIMEOUT_MS",
      "CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS",
      "CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE",
      "ASTRO_CALENDAR_WORKER_ATTEMPTS"
    ];

    for (const key of requiredKeys) expect(compose).not.toContain(`${key}: \${${key}`);
    expect(compose).not.toContain(
      "CHART_WORKER_TELEMETRY_INTERVAL_MS: ${CHART_WORKER_TELEMETRY_INTERVAL_MS"
    );
    expect(compose).toMatch(
      /chart-worker:\n(?:.|\n)*?env_file:\n\s+- path: \.\.\/env\/\.env\.chart-worker\.production\n\s+format: raw/u
    );
    expect(compose).not.toContain("CHART_WORKER_ATTEMPTS:");
  });
});

function parseEnvironmentExample(source: string): Record<string, string> {
  return Object.fromEntries(
    source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function productionRuntimeSource(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://elevenhouse:verified-production-password@postgres:5432/elevenhouse",
    REDIS_URL: "rediss://redis.internal:6379",
    CHART_ENGINE_BASE_URL: "http://chart-engine:8012",
    CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS: "1000",
    CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE: "25",
    CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS: "60000",
    CHART_WORKER_BACKOFF_MS: "1000",
    CHART_WORKER_JITTER: "0.5",
    CHART_WORKER_CONCURRENCY: "2",
    CHART_WORKER_LEASE_MS: "60000",
    CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS: "5000",
    CHART_WORKER_CALCULATION_TIMEOUT_MS: "120000",
    CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS: "30000",
    CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE: "100",
    CHART_WORKER_TELEMETRY_INTERVAL_MS: "30000",
    ASTRO_CALENDAR_WORKER_ATTEMPTS: "5",
    ...overrides
  };
}
