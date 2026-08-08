import { z } from "@elevenhouse/validation";

const schema = z.object({
  REDIS_URL: z.string().trim().url().default("redis://localhost:6379"),
  WORKERS_HEALTH_HOST: z.string().trim().min(1).default("0.0.0.0"),
  WORKERS_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  WORKERS_CALCULATION_PDF_OUTBOX_RELAY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  WORKERS_CALCULATION_PDF_OUTBOX_RELAY_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(500)
    .default(25),
  WORKERS_CALCULATION_PDF_OUTBOX_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(31 * 24 * 60 * 60 * 1_000)
    .default(7 * 24 * 60 * 60 * 1_000),
  WORKERS_FLOW_BOOKING_ENROLLMENT_FUTURE_SKEW_TOLERANCE_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 1_000)
    .default(5 * 60 * 1_000),
  WORKERS_FLOW_BOOKING_ENROLLMENT_DEFER_DELAY_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(86_400_000)
    .default(30_000),
  WORKERS_FLOW_EXECUTION_MAX_MODE: z.enum(["definition_only", "canary"]).default("definition_only"),
  WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS: z.string().default(""),
  WORKERS_FLOW_EXECUTION_INSTANCE_ID: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .default("flows-worker-local"),
  WORKERS_FLOW_EXECUTION_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1_000),
  WORKERS_FLOW_EXECUTION_POLL_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  WORKERS_FLOW_EXECUTION_RECOVERY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(5_000),
  WORKERS_FLOW_EXECUTION_RECOVERY_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(5_000),
  WORKERS_FLOW_WORK_ITEM_WAKE_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(5_000),
  WORKERS_FLOW_APPROVAL_WAKE_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  WORKERS_FLOW_CHART_AI_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WORKERS_FLOW_CHART_AI_OPENAI_API_KEY: z.string().trim().min(1).optional(),
  WORKERS_FLOW_CHART_AI_OPENAI_BASE_URL: z.string().trim().url().default("https://api.openai.com/v1"),
  WORKERS_FLOW_CHART_AI_QUALITY_DRAFT_MODEL: z
    .enum(["gpt-5.4-mini", "gpt-5.5"])
    .default("gpt-5.4-mini"),
  WORKERS_FLOW_CHART_AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(90_000),
  WORKERS_FLOW_CHART_AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8_000).default(5_000),
  WORKERS_FLOW_CHART_AI_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("elevenhouse:flow-chart-ai"),
  WORKERS_FLOW_CHART_AI_RATE_LIMIT_USER_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(3),
  WORKERS_FLOW_CHART_AI_RATE_LIMIT_USER_PER_HOUR: z.coerce.number().int().min(1).max(1_000).default(30),
  WORKERS_FLOW_CHART_AI_RATE_LIMIT_USER_PER_DAY: z.coerce.number().int().min(1).max(10_000).default(150),
  WORKERS_FLOW_EXECUTION_OPERATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(10_000),
  WORKERS_FLOW_EXECUTION_DRAIN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(45_000)
    .default(45_000),
  WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  WORKERS_FLOW_EXECUTION_ERROR_JITTER: z.coerce.number().min(0).max(1).default(0.5),
  WORKERS_FLOW_RUNTIME_CONTROL_HEARTBEAT_INTERVAL_MAX_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(20_000)
    .default(2_000),
  WORKERS_FLOW_RUNTIME_CONTROL_MAINTENANCE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(86_400_000)
    .default(60_000),
  WORKERS_FLOW_RUNTIME_CONTROL_RETENTION_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100),
  WORKERS_DEPLOYMENT_ID: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .default("local-deployment"),
  WORKERS_BUILD_ID: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .default("local-build"),
  WORKERS_CALCULATION_PDF_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  WORKERS_CALCULATION_PDF_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  WORKERS_CALCULATION_PDF_JITTER: z.coerce.number().min(0).max(1).default(0.5),
  WORKERS_CALCULATION_PDF_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  ASTROLOGER_MEDIA_STORAGE_ENDPOINT: z.string().trim().url().default("http://localhost:9000"),
  ASTROLOGER_MEDIA_STORAGE_REGION: z.string().trim().min(1).default("us-east-1"),
  ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: z
    .string()
    .trim()
    .min(3)
    .default("elevenhouse-local-private"),
  ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID: z.string().trim().min(3).default("elevenhouse"),
  ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: z
    .string()
    .trim()
    .min(8)
    .default("elevenhouse-secret"),
  ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true")
});

export type WorkersRuntimeConfig = ReturnType<typeof createWorkersRuntimeConfig>;

const productionRequiredKeys = [
  "REDIS_URL",
  "WORKERS_CALCULATION_PDF_OUTBOX_RELAY_INTERVAL_MS",
  "WORKERS_CALCULATION_PDF_OUTBOX_RELAY_BATCH_SIZE",
  "WORKERS_CALCULATION_PDF_OUTBOX_LOCK_TIMEOUT_MS",
  "WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS",
  "WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS",
  "WORKERS_FLOW_BOOKING_ENROLLMENT_FUTURE_SKEW_TOLERANCE_MS",
  "WORKERS_FLOW_BOOKING_ENROLLMENT_DEFER_DELAY_MS",
  "WORKERS_FLOW_EXECUTION_MAX_MODE",
  "WORKERS_FLOW_EXECUTION_INSTANCE_ID",
  "WORKERS_FLOW_EXECUTION_POLL_INTERVAL_MS",
  "WORKERS_FLOW_EXECUTION_POLL_BATCH_SIZE",
  "WORKERS_FLOW_EXECUTION_RECOVERY_INTERVAL_MS",
  "WORKERS_FLOW_EXECUTION_RECOVERY_BATCH_SIZE",
  "WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS",
  "WORKERS_FLOW_WORK_ITEM_WAKE_BATCH_SIZE",
  "WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS",
  "WORKERS_FLOW_APPROVAL_WAKE_BATCH_SIZE",
  "WORKERS_FLOW_EXECUTION_OPERATION_TIMEOUT_MS",
  "WORKERS_FLOW_EXECUTION_DRAIN_TIMEOUT_MS",
  "WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS",
  "WORKERS_FLOW_EXECUTION_ERROR_JITTER",
  "WORKERS_FLOW_RUNTIME_CONTROL_HEARTBEAT_INTERVAL_MAX_MS",
  "WORKERS_FLOW_RUNTIME_CONTROL_MAINTENANCE_INTERVAL_MS",
  "WORKERS_FLOW_RUNTIME_CONTROL_RETENTION_BATCH_SIZE",
  "WORKERS_DEPLOYMENT_ID",
  "WORKERS_BUILD_ID",
  "WORKERS_CALCULATION_PDF_ATTEMPTS",
  "WORKERS_CALCULATION_PDF_BACKOFF_MS",
  "WORKERS_CALCULATION_PDF_JITTER",
  "WORKERS_CALCULATION_PDF_CONCURRENCY",
  "ASTROLOGER_MEDIA_STORAGE_ENDPOINT",
  "ASTROLOGER_MEDIA_STORAGE_REGION",
  "ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET",
  "ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID",
  "ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY",
  "ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE"
] as const;

export function createWorkersRuntimeConfig(
  source: Record<string, string | undefined> = process.env
) {
  const isProduction = source.NODE_ENV?.trim() === "production";
  if (isProduction) requireExplicitProductionSettings(source);
  const value = schema.parse(source);
  assertFlowChartAiConfig(value, isProduction);
  const flowExecution = createFlowExecutionConfig(value);
  if (isProduction) assertProductionSafety(value);
  return {
    redisUrl: value.REDIS_URL,
    healthHost: value.WORKERS_HEALTH_HOST,
    healthPort: value.WORKERS_HEALTH_PORT,
    outboxRelayIntervalMs: value.WORKERS_CALCULATION_PDF_OUTBOX_RELAY_INTERVAL_MS,
    outboxRelayBatchSize: value.WORKERS_CALCULATION_PDF_OUTBOX_RELAY_BATCH_SIZE,
    outboxLockTimeoutMs: value.WORKERS_CALCULATION_PDF_OUTBOX_LOCK_TIMEOUT_MS,
    flowRuntimeOutboxMaxAttempts: value.WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS,
    flowBookingEnrollment: {
      latenessHorizonMs: value.WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS,
      futureSkewToleranceMs: value.WORKERS_FLOW_BOOKING_ENROLLMENT_FUTURE_SKEW_TOLERANCE_MS,
      deferDelayMs: value.WORKERS_FLOW_BOOKING_ENROLLMENT_DEFER_DELAY_MS
    },
    flowExecution,
    flowChartAi: {
      enabled: value.WORKERS_FLOW_CHART_AI_ENABLED,
      openAiApiKey: value.WORKERS_FLOW_CHART_AI_OPENAI_API_KEY,
      openAiBaseUrl: value.WORKERS_FLOW_CHART_AI_OPENAI_BASE_URL,
      qualityDraftModel: value.WORKERS_FLOW_CHART_AI_QUALITY_DRAFT_MODEL,
      timeoutMs: value.WORKERS_FLOW_CHART_AI_TIMEOUT_MS,
      maxOutputTokens: value.WORKERS_FLOW_CHART_AI_MAX_OUTPUT_TOKENS,
      rateLimitRedisKeyPrefix: value.WORKERS_FLOW_CHART_AI_RATE_LIMIT_REDIS_KEY_PREFIX,
      rateLimits: {
        userPerMinute: { limit: value.WORKERS_FLOW_CHART_AI_RATE_LIMIT_USER_PER_MINUTE, windowSeconds: 60 },
        userPerHour: { limit: value.WORKERS_FLOW_CHART_AI_RATE_LIMIT_USER_PER_HOUR, windowSeconds: 3600 },
        userPerDay: { limit: value.WORKERS_FLOW_CHART_AI_RATE_LIMIT_USER_PER_DAY, windowSeconds: 86400 }
      }
    },
    flowRuntimeControl: {
      heartbeatIntervalMaxMs: value.WORKERS_FLOW_RUNTIME_CONTROL_HEARTBEAT_INTERVAL_MAX_MS,
      maintenanceIntervalMs: value.WORKERS_FLOW_RUNTIME_CONTROL_MAINTENANCE_INTERVAL_MS,
      retentionBatchSize: value.WORKERS_FLOW_RUNTIME_CONTROL_RETENTION_BATCH_SIZE,
      deploymentId: value.WORKERS_DEPLOYMENT_ID,
      buildId: value.WORKERS_BUILD_ID
    },
    calculationPdfAttempts: value.WORKERS_CALCULATION_PDF_ATTEMPTS,
    calculationPdfBackoffMs: value.WORKERS_CALCULATION_PDF_BACKOFF_MS,
    calculationPdfJitter: value.WORKERS_CALCULATION_PDF_JITTER,
    calculationPdfConcurrency: value.WORKERS_CALCULATION_PDF_CONCURRENCY,
    storage: {
      endpoint: value.ASTROLOGER_MEDIA_STORAGE_ENDPOINT,
      region: value.ASTROLOGER_MEDIA_STORAGE_REGION,
      privateBucket: value.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET,
      accessKeyId: value.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: value.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: value.ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE === "true"
    }
  };
}

function createFlowExecutionConfig(value: z.infer<typeof schema>) {
  const ownerUserIds = parseCanaryOwnerUserIds(
    value.WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS
  );
  if (value.WORKERS_FLOW_EXECUTION_MAX_MODE === "definition_only" && ownerUserIds.length > 0) {
    throw new Error(
      "WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS must be empty in definition_only mode"
    );
  }
  if (value.WORKERS_FLOW_EXECUTION_MAX_MODE === "canary" && ownerUserIds.length === 0) {
    throw new Error("WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS is required in canary mode");
  }
  if (
    value.WORKERS_FLOW_EXECUTION_OPERATION_TIMEOUT_MS >=
    value.WORKERS_FLOW_EXECUTION_DRAIN_TIMEOUT_MS
  ) {
    throw new Error(
      "WORKERS_FLOW_EXECUTION_OPERATION_TIMEOUT_MS must be shorter than the drain deadline"
    );
  }
  if (
    value.WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS <
    Math.max(
      value.WORKERS_FLOW_EXECUTION_POLL_INTERVAL_MS,
      value.WORKERS_FLOW_EXECUTION_RECOVERY_INTERVAL_MS,
      value.WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS,
      value.WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS
    )
  ) {
    throw new Error(
      "WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS must cover every flow execution interval"
    );
  }

  return {
    deploymentCeiling:
      value.WORKERS_FLOW_EXECUTION_MAX_MODE === "definition_only"
        ? ({ mode: "definition_only" } as const)
        : ({
            mode: "canary",
            ownerUserIds
          } as const),
    instanceId: value.WORKERS_FLOW_EXECUTION_INSTANCE_ID,
    pollIntervalMs: value.WORKERS_FLOW_EXECUTION_POLL_INTERVAL_MS,
    pollBatchSize: value.WORKERS_FLOW_EXECUTION_POLL_BATCH_SIZE,
    recoveryIntervalMs: value.WORKERS_FLOW_EXECUTION_RECOVERY_INTERVAL_MS,
    recoveryBatchSize: value.WORKERS_FLOW_EXECUTION_RECOVERY_BATCH_SIZE,
    workItemWakeIntervalMs: value.WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS,
    workItemWakeBatchSize: value.WORKERS_FLOW_WORK_ITEM_WAKE_BATCH_SIZE,
    approvalWakeIntervalMs: value.WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS,
    approvalWakeBatchSize: value.WORKERS_FLOW_APPROVAL_WAKE_BATCH_SIZE,
    operationTimeoutMs: value.WORKERS_FLOW_EXECUTION_OPERATION_TIMEOUT_MS,
    drainTimeoutMs: value.WORKERS_FLOW_EXECUTION_DRAIN_TIMEOUT_MS,
    errorBackoffMaxMs: value.WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS,
    errorJitter: value.WORKERS_FLOW_EXECUTION_ERROR_JITTER
  };
}

function assertFlowChartAiConfig(value: z.infer<typeof schema>, isProduction: boolean): void {
  if (!value.WORKERS_FLOW_CHART_AI_ENABLED) return;
  if (!value.WORKERS_FLOW_CHART_AI_OPENAI_API_KEY) {
    throw new Error("WORKERS_FLOW_CHART_AI_OPENAI_API_KEY is required when WORKERS_FLOW_CHART_AI_ENABLED=true");
  }
  if (isProduction && new URL(value.WORKERS_FLOW_CHART_AI_OPENAI_BASE_URL).protocol !== "https:") {
    throw new Error("WORKERS_FLOW_CHART_AI_OPENAI_BASE_URL must use HTTPS in production");
  }
}

function parseCanaryOwnerUserIds(raw: string): readonly string[] {
  if (!raw.trim()) return [];
  const ownerUserIds = raw.split(",").map((value) => value.trim().toLowerCase());
  if (
    ownerUserIds.length > 100 ||
    ownerUserIds.some(
      (ownerUserId) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          ownerUserId
        )
    )
  ) {
    throw new Error("WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS must contain 1 to 100 UUIDs");
  }
  if (new Set(ownerUserIds).size !== ownerUserIds.length) {
    throw new Error("WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS must contain unique UUIDs");
  }
  return [...ownerUserIds].sort();
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

  const storageEndpoint = new URL(value.ASTROLOGER_MEDIA_STORAGE_ENDPOINT);
  if (storageEndpoint.protocol !== "https:") {
    throw new Error("ASTROLOGER_MEDIA_STORAGE_ENDPOINT must use HTTPS in production");
  }
  if (value.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET === "elevenhouse-local-private") {
    throw new Error(
      "ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET must not use the local default in production"
    );
  }
  if (value.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID === "elevenhouse") {
    throw new Error(
      "ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID must not use the local default in production"
    );
  }
  if (value.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY === "elevenhouse-secret") {
    throw new Error(
      "ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY must not use the local default in production"
    );
  }
}
