import { createLogger } from "@elevenhouse/observability";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import { createDrizzleMatrixPdfJobStore } from "@elevenhouse/db/matrix";
import { createMatrixPdfRenderer } from "./matrix-pdf.renderer";
import { createS3MatrixPdfObjectStorage } from "./matrix-pdf.storage";
import { createMatrixPdfQueue, createMatrixPdfWorker, matrixPdfJobName } from "./matrix-pdf.queue";
import { processMatrixPdfJob } from "./matrix-pdf.processor";
import { relayPendingMatrixPdfEvents } from "./matrix-pdf.outbox-relay";
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";
import { createWorkersRuntimeConfig } from "./runtime-config";

const service = "workers";
const logger = createLogger(service);
const config = createWorkersRuntimeConfig();
const postgres = createPostgresRuntime();
const outboxStore = createDrizzleOutboxRelayStore(postgres.database);
const pdfJobStore = createDrizzleMatrixPdfJobStore(postgres.database);
const renderer = createMatrixPdfRenderer();
const storage = createS3MatrixPdfObjectStorage(config.storage);
const queue = createMatrixPdfQueue(config.redisUrl);
const worker = createMatrixPdfWorker(
  config.redisUrl,
  async (job) => {
    if (job.name !== matrixPdfJobName) {
      throw new Error(`Unsupported workers queue job: ${job.name}`);
    }
    const attempts = job.opts.attempts ?? 1;
    await processMatrixPdfJob({
      jobId: job.data.jobId,
      finalAttempt: job.attemptsMade + 1 >= attempts,
      store: pdfJobStore,
      renderer,
      storage,
      now: new Date(),
      logger
    });
  },
  config.matrixPdfConcurrency
);
const readinessChecks = {
  postgres: async () => {
    await postgres.pool.query("select 1");
  },
  matrixPdfQueue: async () => {
    await queue.waitUntilReady();
  },
  matrixPdfWorker: async () => {
    await worker.waitUntilReady();
  }
};
const healthServer = createWorkerReadinessServer({
  getReadiness: () => createWorkerReadiness({ service, checks: readinessChecks })
});
let relayTimer: ReturnType<typeof setInterval> | undefined;
let relayInFlight = false;

async function relayOnce(): Promise<void> {
  if (relayInFlight) return;
  relayInFlight = true;
  try {
    await relayPendingMatrixPdfEvents({
      store: outboxStore,
      queue,
      now: new Date(),
      batchSize: config.outboxRelayBatchSize,
      publishingLockTimeoutMs: config.outboxLockTimeoutMs,
      queueOptions: {
        attempts: config.matrixPdfAttempts,
        backoffMs: config.matrixPdfBackoffMs
      },
      logger
    });
  } finally {
    relayInFlight = false;
  }
}

async function startup(): Promise<void> {
  const readiness = await createWorkerReadiness({ service, checks: readinessChecks });
  if (readiness.status !== "ready") throw new Error("Matrix PDF worker dependencies are not ready");
  await new Promise<void>((resolve, reject) => {
    healthServer.once("error", reject);
    healthServer.listen(config.healthPort, config.healthHost, () => {
      healthServer.off("error", reject);
      resolve();
    });
  });
  await relayOnce();
  relayTimer = setInterval(() => {
    relayOnce().catch((error: unknown) =>
      logger.error("matrix PDF outbox relay failed", { error })
    );
  }, config.outboxRelayIntervalMs);
  relayTimer.unref();
  logger.info("matrix PDF worker ready", readiness);
}

async function shutdown(): Promise<void> {
  if (relayTimer) clearInterval(relayTimer);
  if (healthServer.listening) {
    await new Promise<void>((resolve, reject) =>
      healthServer.close((error) => (error ? reject(error) : resolve()))
    );
  }
  await worker.close();
  await queue.close();
  await postgres.close();
}

startup().catch((error: unknown) => {
  shutdown().finally(() => {
    logger.error("matrix PDF worker startup failed", { error });
    process.exit(1);
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error("matrix PDF worker shutdown failed", { error });
        process.exit(1);
      });
  });
}
