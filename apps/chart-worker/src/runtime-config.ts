import { z } from "@elevenhouse/validation";

const schema = z.object({
  REDIS_URL: z.string().trim().url().default("redis://localhost:6379"),
  CHART_WORKER_HEALTH_HOST: z.string().trim().min(1).default("0.0.0.0"),
  CHART_WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3012),
  CHART_ENGINE_BASE_URL: z.string().trim().url().default("http://localhost:8012"),
  CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(25),
  CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  CHART_WORKER_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  CHART_WORKER_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  CHART_WORKER_JITTER: z.coerce.number().min(0).max(1).default(0.5),
  CHART_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2)
});

const productionRequiredKeys = [
  "REDIS_URL",
  "CHART_ENGINE_BASE_URL",
  "CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS",
  "CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE",
  "CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS",
  "CHART_WORKER_ATTEMPTS",
  "CHART_WORKER_BACKOFF_MS",
  "CHART_WORKER_JITTER",
  "CHART_WORKER_CONCURRENCY"
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
    redisUrl: value.REDIS_URL,
    healthHost: value.CHART_WORKER_HEALTH_HOST,
    healthPort: value.CHART_WORKER_HEALTH_PORT,
    chartEngineBaseUrl: value.CHART_ENGINE_BASE_URL,
    outboxRelayIntervalMs: value.CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS,
    outboxRelayBatchSize: value.CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE,
    outboxLockTimeoutMs: value.CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS,
    attempts: value.CHART_WORKER_ATTEMPTS,
    backoffMs: value.CHART_WORKER_BACKOFF_MS,
    jitter: value.CHART_WORKER_JITTER,
    concurrency: value.CHART_WORKER_CONCURRENCY
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
  const redis = new URL(value.REDIS_URL);
  if (["localhost", "127.0.0.1", "::1"].includes(redis.hostname)) {
    throw new Error("REDIS_URL must not use a loopback host in production");
  }
  const chartEngine = new URL(value.CHART_ENGINE_BASE_URL);
  if (["localhost", "127.0.0.1", "::1"].includes(chartEngine.hostname)) {
    throw new Error("CHART_ENGINE_BASE_URL must not use a loopback host in production");
  }
}
