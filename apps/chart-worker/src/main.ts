import { randomUUID } from "node:crypto";
import { createLogger } from "@elevenhouse/observability";
import { createDrizzleAstroCalendarGenerationStore } from "@elevenhouse/db/astro-calendar";
import { createDrizzleChartWorkerJobStore } from "@elevenhouse/db/charts";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { ChartEngineHttpClient } from "@elevenhouse/chart-engine-client";
import { resolveChartExecutionProfile } from "@elevenhouse/domain";
import { UnrecoverableError } from "bullmq";
import {
  createChartCalculationOutboxRelay,
  relayPendingChartCalculationEvents
} from "./chart-jobs.outbox-relay";
import { processAstroCalendarGenerationJob } from "./astro-calendar-jobs.processor";
import { processChartCalculationJob } from "./chart-jobs.processor";
import { createChartQueueTelemetry } from "./chart-queue-telemetry";
import {
  astroCalendarGenerationJobName,
  chartCalculationJobName,
  createChartCalculationQueue,
  createChartCalculationWorker,
  deferChartCalculationDelivery,
  isFinalConfiguredQueueAttempt,
  observeChartCalculationWorker
} from "./chart-jobs.queue";
import { createChartJobRecovery, createChartWorkerRuntime } from "./chart-worker-runtime";
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";
import { createChartWorkerRuntimeConfig } from "./runtime-config";

const service = "chart-worker";
const logger = createLogger(service);
const config = createChartWorkerRuntimeConfig();
const postgres = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
const outboxStore = createDrizzleOutboxRelayStore(postgres.database);
const jobStore = createDrizzleChartWorkerJobStore(postgres.database, {
  operationTimeoutMs: config.storageOperationTimeoutMs
});
const astroCalendarGenerationStore = createDrizzleAstroCalendarGenerationStore(postgres.database);
const chartEngine = new ChartEngineHttpClient({ baseUrl: config.chartEngineBaseUrl });
const executionProfile = resolveChartExecutionProfile(process.env);
const workerId = `chart-worker:${randomUUID()}`;
const shutdownController = new AbortController();
let acceptingWork = false;
const queue = createChartCalculationQueue(config.redisUrl);
const worker = createChartCalculationWorker(
  config.redisUrl,
  async (job) => {
    if (job.name === chartCalculationJobName && "jobId" in job.data) {
      await processChartCalculationJob({
        jobId: job.data.jobId,
        workerId,
        leaseMs: config.leaseMs,
        calculationTimeoutMs: config.calculationTimeoutMs,
        storageOperationTimeoutMs: config.storageOperationTimeoutMs,
        retryDelayMs: config.backoffMs,
        retryJitter: config.jitter,
        delivery: {
          deferFor: (delayMs) => deferChartCalculationDelivery(job, { delayMs })
        },
        shutdownSignal: shutdownController.signal,
        store: jobStore,
        engine: chartEngine,
        logger
      });
      return;
    }
    if (job.name === astroCalendarGenerationJobName && "generationId" in job.data) {
      const finalAttempt = isFinalConfiguredQueueAttempt({
        attempts: job.opts.attempts,
        attemptsMade: job.attemptsMade
      });
      await processAstroCalendarGenerationJob({
        generationId: job.data.generationId,
        finalAttempt,
        store: astroCalendarGenerationStore,
        engine: chartEngine,
        now: new Date(),
        storageOperationTimeoutMs: config.storageOperationTimeoutMs
      });
      return;
    }
    throw new UnrecoverableError("Unsupported chart calculation queue job");
  },
  {
    concurrency: config.concurrency,
    durableLeaseMs: config.leaseMs
  }
);
const stopWorkerObservation = observeChartCalculationWorker(worker, logger);
const readinessChecks = {
  postgres: async () => {
    await postgres.pool.query("select 1");
  },
  chartCalculationQueue: async () => {
    await queue.waitUntilReady();
  },
  chartCalculationWorker: async () => {
    await worker.waitUntilReady();
  },
  chartEngine: async () => {
    return chartEngine.checkReady({
      expectedProfile: executionProfile,
      timeoutMs: config.calculationTimeoutMs
    });
  }
};
const readinessServer = createWorkerReadinessServer({
  getReadiness: () =>
    createWorkerReadiness({
      service,
      acceptingWork,
      checkTimeoutMs: config.storageOperationTimeoutMs,
      expectedExecutionProfile: executionProfile,
      checks: readinessChecks
    })
});
const relay = createChartCalculationOutboxRelay({
  intervalMs: config.outboxRelayIntervalMs,
  operationTimeoutMs: config.storageOperationTimeoutMs,
  relayOnce: async () => {
    await relayPendingChartCalculationEvents({
      store: outboxStore,
      chartJobs: jobStore,
      queue,
      now: new Date(),
      batchSize: config.outboxRelayBatchSize,
      publishingLockTimeoutMs: config.outboxLockTimeoutMs,
      queueOptions: {
        backoffMs: config.backoffMs,
        jitter: config.jitter
      },
      astroCalendarAttempts: config.astroCalendarAttempts,
      logger
    });
  },
  onError: () =>
    logger.error("chart calculation outbox relay failed", {
      errorCode: "chart_outbox_relay_failed"
    })
});
const recovery = createChartJobRecovery({
  store: jobStore,
  limit: config.exhaustedSweepBatchSize,
  intervalMs: config.exhaustedSweepIntervalMs,
  operationTimeoutMs: config.storageOperationTimeoutMs,
  logger
});
const telemetry = createChartQueueTelemetry({
  queue,
  intervalMs: config.telemetryIntervalMs,
  operationTimeoutMs: config.storageOperationTimeoutMs,
  logger
});
const runtime = createChartWorkerRuntime({
  readinessServer,
  readinessHost: config.healthHost,
  readinessPort: config.healthPort,
  operationTimeoutMs: config.storageOperationTimeoutMs,
  relay,
  recovery,
  telemetry,
  abortInFlight: () => shutdownController.abort(),
  setAcceptingWork: (accepting) => {
    acceptingWork = accepting;
  },
  onFatalWorkerStop: () => {
    stopWorkerObservation();
    process.exitCode = 1;
  },
  queue,
  worker,
  postgres,
  chartEngine: {
    checkReady: () =>
      chartEngine.checkReady({
        expectedProfile: executionProfile,
        timeoutMs: config.calculationTimeoutMs
      })
  },
  logger
});

runtime.startup().catch(() => {
  runtime.shutdown().finally(() => {
    stopWorkerObservation();
    logger.error("chart worker startup failed", { errorCode: "chart_worker_startup_failed" });
    process.exit(1);
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    runtime
      .shutdown()
      .then(() => {
        stopWorkerObservation();
        process.exit(0);
      })
      .catch(() => {
        logger.error("chart worker shutdown failed", {
          errorCode: "chart_worker_shutdown_failed"
        });
        process.exit(1);
      });
  });
}
