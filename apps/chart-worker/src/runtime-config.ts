import { z } from "@elevenhouse/validation";

const productionChartEngineBaseUrl = "http://chart-engine:8012";

const schema = z
  .object({
    DATABASE_URL: z
      .string()
      .trim()
      .url()
      .default("postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse"),
    REDIS_URL: z.string().trim().url().default("redis://localhost:6379"),
    CHART_WORKER_HEALTH_HOST: z.string().trim().min(1).default("0.0.0.0"),
    CHART_WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3012),
    CHART_ENGINE_BASE_URL: z.string().trim().url().default("http://localhost:8012"),
    CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(25),
    CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    CHART_WORKER_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
    CHART_WORKER_JITTER: z.coerce.number().min(0).max(1).default(0.5),
    CHART_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    CHART_WORKER_LEASE_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(24 * 60 * 60 * 1_000)
      .default(60_000),
    CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(5_000),
    CHART_WORKER_CALCULATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(24 * 60 * 60 * 1_000)
      .default(120_000),
    CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),
    CHART_WORKER_TELEMETRY_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    ASTRO_CALENDAR_WORKER_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5)
  })
  .superRefine((value, context) => {
    if (value.CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS * 2 >= value.CHART_WORKER_LEASE_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS"],
        message: "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS must be less than half the lease"
      });
    }
  });

const productionRequiredKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "CHART_ENGINE_BASE_URL",
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

export type ChartWorkerRuntimeConfig = ReturnType<typeof createChartWorkerRuntimeConfig>;

export function createChartWorkerRuntimeConfig(
  source: Record<string, string | undefined> = process.env
) {
  const isProduction = source.NODE_ENV?.trim() === "production";
  if (isProduction) requireExplicitProductionSettings(source);
  const value = schema.parse(source);
  if (isProduction) assertProductionSafety(value);
  return {
    databaseUrl: value.DATABASE_URL,
    redisUrl: value.REDIS_URL,
    healthHost: value.CHART_WORKER_HEALTH_HOST,
    healthPort: value.CHART_WORKER_HEALTH_PORT,
    chartEngineBaseUrl: value.CHART_ENGINE_BASE_URL,
    outboxRelayIntervalMs: value.CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS,
    outboxRelayBatchSize: value.CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE,
    outboxLockTimeoutMs: value.CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS,
    backoffMs: value.CHART_WORKER_BACKOFF_MS,
    jitter: value.CHART_WORKER_JITTER,
    concurrency: value.CHART_WORKER_CONCURRENCY,
    leaseMs: value.CHART_WORKER_LEASE_MS,
    storageOperationTimeoutMs: value.CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS,
    calculationTimeoutMs: value.CHART_WORKER_CALCULATION_TIMEOUT_MS,
    exhaustedSweepIntervalMs: value.CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS,
    exhaustedSweepBatchSize: value.CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE,
    telemetryIntervalMs: value.CHART_WORKER_TELEMETRY_INTERVAL_MS,
    astroCalendarAttempts: value.ASTRO_CALENDAR_WORKER_ATTEMPTS
  };
}

function requireExplicitProductionSettings(source: Record<string, string | undefined>): void {
  for (const key of productionRequiredKeys) {
    if (!source[key]?.trim()) {
      throw new Error(`${key} is required in production`);
    }
  }
}

function assertProductionSafety(value: z.infer<typeof schema>): void {
  if (value.CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS > 5_000) {
    throw new Error("CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS must not exceed 5000 in production");
  }
  const redis = new URL(value.REDIS_URL);
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(redis.hostname)) {
    throw new Error("REDIS_URL must not use a loopback host in production");
  }
  const chartEngine = new URL(value.CHART_ENGINE_BASE_URL);
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(chartEngine.hostname)) {
    throw new Error("CHART_ENGINE_BASE_URL must not use a loopback host in production");
  }
  if (!isExactRootOrigin(chartEngine, productionChartEngineBaseUrl)) {
    throw new Error(
      `CHART_ENGINE_BASE_URL must equal ${productionChartEngineBaseUrl} in production`
    );
  }
  const database = new URL(value.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.hostname !== "postgres" ||
    database.port !== "5432" ||
    database.pathname !== "/elevenhouse" ||
    database.username !== "elevenhouse" ||
    database.password === "" ||
    database.search !== "" ||
    database.hash !== ""
  ) {
    throw new Error(
      "DATABASE_URL must target postgresql://elevenhouse@postgres:5432/elevenhouse in production"
    );
  }
}

function isExactRootOrigin(url: URL, expectedOrigin: string): boolean {
  return (
    url.origin === expectedOrigin &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  );
}
