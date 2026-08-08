import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorkersRuntimeConfig } from "./runtime-config";

describe("createWorkersRuntimeConfig", () => {
  it("uses safe local defaults and the private media bucket", () => {
    expect(createWorkersRuntimeConfig({})).toEqual({
      redisUrl: "redis://localhost:6379",
      healthHost: "0.0.0.0",
      healthPort: 3010,
      outboxRelayIntervalMs: 1000,
      outboxRelayBatchSize: 25,
      outboxLockTimeoutMs: 60000,
      flowRuntimeOutboxMaxAttempts: 5,
      flowBookingEnrollment: {
        latenessHorizonMs: 604_800_000,
        futureSkewToleranceMs: 300_000,
        deferDelayMs: 30_000
      },
      flowChartAi: {
        enabled: false,
        openAiApiKey: undefined,
        openAiBaseUrl: "https://api.openai.com/v1",
        qualityDraftModel: "gpt-5.4-mini",
        timeoutMs: 90_000,
        maxOutputTokens: 5_000,
        rateLimitRedisKeyPrefix: "elevenhouse:flow-chart-ai",
        rateLimits: {
          userPerMinute: { limit: 3, windowSeconds: 60 },
          userPerHour: { limit: 30, windowSeconds: 3600 },
          userPerDay: { limit: 150, windowSeconds: 86400 }
        }
      },
      flowExecution: {
        deploymentCeiling: { mode: "definition_only" },
        instanceId: "flows-worker-local",
        pollIntervalMs: 1_000,
        pollBatchSize: 10,
        recoveryIntervalMs: 5_000,
        recoveryBatchSize: 25,
        workItemWakeIntervalMs: 5_000,
        workItemWakeBatchSize: 25,
        approvalWakeIntervalMs: 5_000,
        approvalWakeBatchSize: 25,
        operationTimeoutMs: 10_000,
        drainTimeoutMs: 45_000,
        errorBackoffMaxMs: 30_000,
        errorJitter: 0.5
      },
      flowRuntimeControl: {
        heartbeatIntervalMaxMs: 2_000,
        maintenanceIntervalMs: 60_000,
        retentionBatchSize: 100,
        deploymentId: "local-deployment",
        buildId: "local-build"
      },
      calculationPdfAttempts: 5,
      calculationPdfBackoffMs: 1000,
      calculationPdfJitter: 0.5,
      calculationPdfConcurrency: 2,
      storage: {
        endpoint: "http://localhost:9000",
        region: "us-east-1",
        privateBucket: "elevenhouse-local-private",
        accessKeyId: "elevenhouse",
        secretAccessKey: "elevenhouse-secret",
        forcePathStyle: true
      }
    });
  });

  it("parses production queue and private storage settings", () => {
    expect(
      createWorkersRuntimeConfig({
        REDIS_URL: "rediss://worker:secret@redis.internal:6380/2",
        WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS: "7",
        WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS: "86400000",
        WORKERS_FLOW_BOOKING_ENROLLMENT_FUTURE_SKEW_TOLERANCE_MS: "60000",
        WORKERS_FLOW_BOOKING_ENROLLMENT_DEFER_DELAY_MS: "15000",
        WORKERS_CALCULATION_PDF_ATTEMPTS: "7",
        WORKERS_CALCULATION_PDF_JITTER: "0.25",
        WORKERS_CALCULATION_PDF_CONCURRENCY: "4",
        ASTROLOGER_MEDIA_STORAGE_ENDPOINT: "https://objects.internal",
        ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: "elevenhouse-private",
        ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: "false"
      })
    ).toMatchObject({
      redisUrl: "rediss://worker:secret@redis.internal:6380/2",
      flowRuntimeOutboxMaxAttempts: 7,
      flowBookingEnrollment: {
        latenessHorizonMs: 86_400_000,
        futureSkewToleranceMs: 60_000,
        deferDelayMs: 15_000
      },
      calculationPdfAttempts: 7,
      calculationPdfJitter: 0.25,
      calculationPdfConcurrency: 4,
      storage: {
        endpoint: "https://objects.internal",
        privateBucket: "elevenhouse-private",
        forcePathStyle: false
      }
    });
  });

  it("rejects unsafe queue bounds", () => {
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_CALCULATION_PDF_CONCURRENCY: "50" })
    ).toThrow();
    expect(() => createWorkersRuntimeConfig({ WORKERS_CALCULATION_PDF_JITTER: "1.5" })).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS: "21" })
    ).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({
        WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS: "2678400001"
      })
    ).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({
        WORKERS_FLOW_BOOKING_ENROLLMENT_FUTURE_SKEW_TOLERANCE_MS: "3600001"
      })
    ).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_BOOKING_ENROLLMENT_DEFER_DELAY_MS: "0" })
    ).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS: "999" })
    ).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_WORK_ITEM_WAKE_BATCH_SIZE: "101" })
    ).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS: "999" })
    ).toThrow();
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_APPROVAL_WAKE_BATCH_SIZE: "101" })
    ).toThrow();
  });

  it("requires an explicit provider credential before enabling Flow chart AI", () => {
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_CHART_AI_ENABLED: "true" })
    ).toThrow("WORKERS_FLOW_CHART_AI_OPENAI_API_KEY");

    expect(
      createWorkersRuntimeConfig({
        WORKERS_FLOW_CHART_AI_ENABLED: "true",
        WORKERS_FLOW_CHART_AI_OPENAI_API_KEY: "worker-ai-secret",
        WORKERS_FLOW_CHART_AI_RATE_LIMIT_USER_PER_MINUTE: "5"
      }).flowChartAi
    ).toMatchObject({
      enabled: true,
      openAiApiKey: "worker-ai-secret",
      rateLimits: { userPerMinute: { limit: 5, windowSeconds: 60 } }
    });
  });

  it("parses an explicit bounded flow execution canary owner allowlist", () => {
    expect(
      createWorkersRuntimeConfig({
        WORKERS_FLOW_EXECUTION_MAX_MODE: "canary",
        WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS:
          "00000000-0000-4000-8000-000000000002, 00000000-0000-4000-8000-000000000001",
        WORKERS_FLOW_EXECUTION_INSTANCE_ID: "flows-worker-canary-a",
        WORKERS_FLOW_EXECUTION_POLL_BATCH_SIZE: "20",
        WORKERS_FLOW_EXECUTION_RECOVERY_BATCH_SIZE: "50"
      }).flowExecution
    ).toEqual({
      deploymentCeiling: {
        mode: "canary",
        ownerUserIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002"
        ]
      },
      instanceId: "flows-worker-canary-a",
      pollIntervalMs: 1_000,
      pollBatchSize: 20,
      recoveryIntervalMs: 5_000,
      recoveryBatchSize: 50,
      workItemWakeIntervalMs: 5_000,
      workItemWakeBatchSize: 25,
      approvalWakeIntervalMs: 5_000,
      approvalWakeBatchSize: 25,
      operationTimeoutMs: 10_000,
      drainTimeoutMs: 45_000,
      errorBackoffMaxMs: 30_000,
      errorJitter: 0.5
    });
  });

  it("rejects empty, duplicated, malformed or prematurely global flow rollout", () => {
    expect(() => createWorkersRuntimeConfig({ WORKERS_FLOW_EXECUTION_MAX_MODE: "canary" })).toThrow(
      "WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS"
    );
    expect(() =>
      createWorkersRuntimeConfig({
        WORKERS_FLOW_EXECUTION_MAX_MODE: "canary",
        WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS:
          "00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000001"
      })
    ).toThrow("unique");
    expect(() =>
      createWorkersRuntimeConfig({
        WORKERS_FLOW_EXECUTION_MAX_MODE: "definition_only",
        WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS: "00000000-0000-4000-8000-000000000001"
      })
    ).toThrow("definition_only");
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_FLOW_EXECUTION_MAX_MODE: "enabled" })
    ).toThrow("WORKERS_FLOW_EXECUTION_MAX_MODE");
    expect(() =>
      createWorkersRuntimeConfig({
        WORKERS_FLOW_EXECUTION_MAX_MODE: "canary",
        WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
      })
    ).toThrow("unique");
  });

  it("requires every external dependency and PDF tuning value explicitly in production", () => {
    expect(() => createWorkersRuntimeConfig({ NODE_ENV: "production" })).toThrow("REDIS_URL");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        WORKERS_CALCULATION_PDF_BACKOFF_MS: undefined
      })
    ).toThrow("WORKERS_CALCULATION_PDF_BACKOFF_MS");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS: undefined
      })
    ).toThrow("WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS: undefined
      })
    ).toThrow("WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS: undefined
      })
    ).toThrow("WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS: undefined
      })
    ).toThrow("WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS");
  });

  it("rejects local object-storage defaults and insecure endpoints in production", () => {
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        REDIS_URL: "redis://127.0.0.1:6379"
      })
    ).toThrow("REDIS_URL");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        ASTROLOGER_MEDIA_STORAGE_ENDPOINT: "http://objects.internal"
      })
    ).toThrow("ASTROLOGER_MEDIA_STORAGE_ENDPOINT");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: "elevenhouse-secret"
      })
    ).toThrow("ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY");
    expect(() =>
      createWorkersRuntimeConfig({
        ...productionConfig(),
        ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: "short"
      })
    ).toThrow("ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY");
  });

  it("accepts an explicit bounded production configuration", () => {
    expect(createWorkersRuntimeConfig(productionConfig())).toMatchObject({
      redisUrl: "redis://redis:6379",
      outboxRelayIntervalMs: 1000,
      outboxRelayBatchSize: 25,
      outboxLockTimeoutMs: 60000,
      flowRuntimeOutboxMaxAttempts: 5,
      flowBookingEnrollment: {
        latenessHorizonMs: 604_800_000,
        futureSkewToleranceMs: 300_000,
        deferDelayMs: 30_000
      },
      flowExecution: {
        deploymentCeiling: { mode: "definition_only" },
        instanceId: "flows-worker-production-a",
        pollIntervalMs: 1_000,
        pollBatchSize: 10,
        recoveryIntervalMs: 5_000,
        recoveryBatchSize: 25,
        workItemWakeIntervalMs: 5_000,
        workItemWakeBatchSize: 25,
        approvalWakeIntervalMs: 5_000,
        approvalWakeBatchSize: 25,
        operationTimeoutMs: 10_000,
        drainTimeoutMs: 45_000,
        errorBackoffMaxMs: 30_000,
        errorJitter: 0.5
      },
      flowRuntimeControl: {
        heartbeatIntervalMaxMs: 2_000,
        maintenanceIntervalMs: 60_000,
        retentionBatchSize: 100,
        deploymentId: "production-deployment-001",
        buildId: "production-build-001"
      },
      calculationPdfAttempts: 5,
      calculationPdfBackoffMs: 1000,
      calculationPdfJitter: 0.5,
      calculationPdfConcurrency: 2,
      storage: {
        endpoint: "https://objects.elevenhouse.test",
        privateBucket: "elevenhouse-private",
        accessKeyId: "pdf-worker",
        secretAccessKey: "production-secret-value",
        forcePathStyle: true
      }
    });
  });

  it("accepts production canary only as a bounded deployment ceiling", () => {
    expect(
      createWorkersRuntimeConfig({
        ...productionConfig(),
        WORKERS_FLOW_EXECUTION_MAX_MODE: "canary",
        WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS: "00000000-0000-4000-8000-000000000001"
      }).flowExecution.deploymentCeiling
    ).toEqual({
      mode: "canary",
      ownerUserIds: ["00000000-0000-4000-8000-000000000001"]
    });
  });

  it("keeps the checked-in production environment example executable by workers", () => {
    const source = parseEnvironmentExample(
      readFileSync("deployment/env/.env.production.example", "utf8")
    );

    expect(() => createWorkersRuntimeConfig({ ...source, NODE_ENV: "production" })).not.toThrow();
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

function productionConfig(): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    REDIS_URL: "redis://redis:6379",
    WORKERS_CALCULATION_PDF_OUTBOX_RELAY_INTERVAL_MS: "1000",
    WORKERS_CALCULATION_PDF_OUTBOX_RELAY_BATCH_SIZE: "25",
    WORKERS_CALCULATION_PDF_OUTBOX_LOCK_TIMEOUT_MS: "60000",
    WORKERS_FLOW_RUNTIME_OUTBOX_MAX_ATTEMPTS: "5",
    WORKERS_FLOW_BOOKING_ENROLLMENT_LATENESS_HORIZON_MS: "604800000",
    WORKERS_FLOW_BOOKING_ENROLLMENT_FUTURE_SKEW_TOLERANCE_MS: "300000",
    WORKERS_FLOW_BOOKING_ENROLLMENT_DEFER_DELAY_MS: "30000",
    WORKERS_FLOW_EXECUTION_MAX_MODE: "definition_only",
    WORKERS_FLOW_EXECUTION_MAX_CANARY_OWNER_USER_IDS: "",
    WORKERS_FLOW_EXECUTION_INSTANCE_ID: "flows-worker-production-a",
    WORKERS_FLOW_EXECUTION_POLL_INTERVAL_MS: "1000",
    WORKERS_FLOW_EXECUTION_POLL_BATCH_SIZE: "10",
    WORKERS_FLOW_EXECUTION_RECOVERY_INTERVAL_MS: "5000",
    WORKERS_FLOW_EXECUTION_RECOVERY_BATCH_SIZE: "25",
    WORKERS_FLOW_WORK_ITEM_WAKE_INTERVAL_MS: "5000",
    WORKERS_FLOW_WORK_ITEM_WAKE_BATCH_SIZE: "25",
    WORKERS_FLOW_APPROVAL_WAKE_INTERVAL_MS: "5000",
    WORKERS_FLOW_APPROVAL_WAKE_BATCH_SIZE: "25",
    WORKERS_FLOW_EXECUTION_OPERATION_TIMEOUT_MS: "10000",
    WORKERS_FLOW_EXECUTION_DRAIN_TIMEOUT_MS: "45000",
    WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS: "30000",
    WORKERS_FLOW_EXECUTION_ERROR_JITTER: "0.5",
    WORKERS_FLOW_RUNTIME_CONTROL_HEARTBEAT_INTERVAL_MAX_MS: "2000",
    WORKERS_FLOW_RUNTIME_CONTROL_MAINTENANCE_INTERVAL_MS: "60000",
    WORKERS_FLOW_RUNTIME_CONTROL_RETENTION_BATCH_SIZE: "100",
    WORKERS_DEPLOYMENT_ID: "production-deployment-001",
    WORKERS_BUILD_ID: "production-build-001",
    WORKERS_CALCULATION_PDF_ATTEMPTS: "5",
    WORKERS_CALCULATION_PDF_BACKOFF_MS: "1000",
    WORKERS_CALCULATION_PDF_JITTER: "0.5",
    WORKERS_CALCULATION_PDF_CONCURRENCY: "2",
    ASTROLOGER_MEDIA_STORAGE_ENDPOINT: "https://objects.elevenhouse.test",
    ASTROLOGER_MEDIA_STORAGE_REGION: "us-east-1",
    ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: "elevenhouse-private",
    ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID: "pdf-worker",
    ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: "production-secret-value",
    ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: "true"
  };
}
