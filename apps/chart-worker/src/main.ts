import { createLogger, serializeError } from "@elevenhouse/observability";
import { createDrizzleChartWorkerJobStore } from "@elevenhouse/db/charts";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { ChartEngineHttpClient } from "@elevenhouse/chart-engine-client";
import { UnrecoverableError } from "bullmq";
import {
  createChartCalculationOutboxRelay,
  relayPendingChartCalculationEvents
} from "./chart-jobs.outbox-relay";
import { processChartCalculationJob } from "./chart-jobs.processor";
import {
  chartCalculationJobName,
  createChartCalculationQueue,
  createChartCalculationWorker,
  observeChartCalculationWorker
} from "./chart-jobs.queue";
import { createChartWorkerRuntime } from "./chart-worker-runtime";
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";
import { createChartWorkerRuntimeConfig } from "./runtime-config";

const service = "chart-worker";
const logger = createLogger(service);
const config = createChartWorkerRuntimeConfig();
const postgres = createPostgresRuntime();
const outboxStore = createDrizzleOutboxRelayStore(postgres.database);
const jobStore = createDrizzleChartWorkerJobStore(postgres.database);
const chartEngine = new ChartEngineHttpClient({ baseUrl: config.chartEngineBaseUrl });
const queue = createChartCalculationQueue(config.redisUrl);
const worker = createChartCalculationWorker(
  config.redisUrl,
  async (job) => {
    const attempts = job.opts.attempts ?? 1;
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    if (job.name === chartCalculationJobName && "jobId" in job.data) {
      await processChartCalculationJob({
        jobId: job.data.jobId,
        finalAttempt,
        store: jobStore,
        engine: chartEngine,
        now: new Date()
      });
      return;
    }
    throw new UnrecoverableError("Unsupported chart calculation queue job");
  },
  config.concurrency
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
    await chartEngine.checkReady();
  }
};
const readinessServer = createWorkerReadinessServer({
  getReadiness: () => createWorkerReadiness({ service, checks: readinessChecks })
});
const relay = createChartCalculationOutboxRelay({
  intervalMs: config.outboxRelayIntervalMs,
  relayOnce: async () => {
    await relayPendingChartCalculationEvents({
      store: outboxStore,
      queue,
      now: new Date(),
      batchSize: config.outboxRelayBatchSize,
      publishingLockTimeoutMs: config.outboxLockTimeoutMs,
      queueOptions: {
        attempts: config.attempts,
        backoffMs: config.backoffMs,
        jitter: config.jitter
      },
      logger
    });
  },
  onError: (error) => logger.error("chart calculation outbox relay failed", { error })
});
const runtime = createChartWorkerRuntime({
  readinessServer,
  readinessHost: config.healthHost,
  readinessPort: config.healthPort,
  relay,
  queue,
  worker,
  postgres,
  chartEngine,
  logger
});

runtime.startup().catch((error: unknown) => {
  runtime.shutdown().finally(() => {
    stopWorkerObservation();
    logger.error("chart worker startup failed", { error: serializeError(error) });
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
      .catch((error: unknown) => {
        logger.error("chart worker shutdown failed", { error: serializeError(error) });
        process.exit(1);
      });
  });
}
