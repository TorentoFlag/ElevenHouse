import { createLogger } from "@elevenhouse/observability";
import {
  createDrizzleFlowRuntimeDispatchOutboxStore,
  createDrizzleFlowRuntimeStore,
  createDrizzleFlowStore
} from "@elevenhouse/db";
import {
  createDrizzleCalculationPdfCleanupStore,
  createDrizzleCalculationPdfJobStore,
  createDrizzleCalculationStore
} from "@elevenhouse/db/calculations";
import { createDrizzleDictionaryStore } from "@elevenhouse/db/dictionary";
import { createDrizzleMediaAssetStore } from "@elevenhouse/db/media";
import { createDrizzleMatrixReportStore } from "@elevenhouse/db/matrix";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { dispatchFlowRuntimeEvent, resolveChartExecutionProfile } from "@elevenhouse/domain";
import { UnrecoverableError } from "bullmq";
import { processCalculationPdfCleanup } from "./calculation-pdf/calculation-pdf.cleanup";
import {
  createCalculationPdfOutboxRelay,
  relayPendingCalculationPdfEvents
} from "./calculation-pdf/calculation-pdf.outbox-relay";
import { processCalculationPdfJob } from "./calculation-pdf/calculation-pdf.processor";
import {
  calculationPdfDeleteJobName,
  calculationPdfRenderJobName,
  createCalculationPdfQueue,
  createCalculationPdfWorker,
  observeCalculationPdfWorker
} from "./calculation-pdf/calculation-pdf.queue";
import { createCalculationPdfRegistry } from "./calculation-pdf/calculation-pdf.registry";
import { createS3CalculationPdfObjectStorage } from "./calculation-pdf/calculation-pdf.storage";
import { createChartPdfRenderer } from "./calculation-pdf/chart-pdf.renderer";
import { createChartPdfSource } from "./calculation-pdf/chart-pdf.source";
import { createHumanDesignPdfRenderer } from "./calculation-pdf/human-design-pdf.renderer";
import { createHumanDesignPdfSource } from "./calculation-pdf/human-design-pdf.source";
import { createMatrixPdfRenderer } from "./calculation-pdf/matrix-pdf.renderer";
import { createMatrixPdfSource } from "./calculation-pdf/matrix-pdf.source";
import { createNumerologyPdfRenderer } from "./calculation-pdf/numerology-pdf.renderer";
import { createNumerologyPdfSource } from "./calculation-pdf/numerology-pdf.source";
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";
import { relayPendingFlowRuntimeDispatchEvents } from "./flows/flow-runtime.outbox-relay";
import { createWorkersRuntimeConfig } from "./runtime-config";

const service = "workers";
const logger = createLogger(service);
const config = createWorkersRuntimeConfig();
const postgres = createPostgresRuntime();
const outboxStore = createDrizzleOutboxRelayStore(postgres.database);
const calculationStore = createDrizzleCalculationStore(postgres.database);
const flowStore = createDrizzleFlowStore(postgres.database);
const flowRuntimeStore = createDrizzleFlowRuntimeStore(postgres.database);
const flowRuntimeDispatchOutboxStore = createDrizzleFlowRuntimeDispatchOutboxStore(
  postgres.database
);
const dictionaryStore = createDrizzleDictionaryStore(postgres.database);
const pdfJobStore = createDrizzleCalculationPdfJobStore(postgres.database);
const pdfCleanupStore = createDrizzleCalculationPdfCleanupStore(postgres.database);
const mediaStore = createDrizzleMediaAssetStore(postgres.database);
const matrixReportStore = createDrizzleMatrixReportStore(postgres.database);
const matrixSource = createMatrixPdfSource(calculationStore, matrixReportStore);
const matrixRenderer = createMatrixPdfRenderer();
const numerologySource = createNumerologyPdfSource(calculationStore);
const numerologyRenderer = createNumerologyPdfRenderer();
const chartSource = createChartPdfSource(
  calculationStore,
  dictionaryStore,
  resolveChartExecutionProfile(process.env)
);
const chartRenderer = createChartPdfRenderer();
const humanDesignSource = createHumanDesignPdfSource(calculationStore);
const humanDesignRenderer = createHumanDesignPdfRenderer();
const registry = createCalculationPdfRegistry([
  {
    module: "matrix",
    methodCode: "ladini_22",
    render: async (job) => matrixRenderer.render(await matrixSource.load(job))
  },
  {
    module: "numerology",
    methodCode: "pythagorean",
    render: async (job) => numerologyRenderer.render(await numerologySource.load(job))
  },
  {
    module: "chart",
    methodCode: "natal",
    render: async (job) => chartRenderer.render(await chartSource.load(job))
  },
  {
    module: "human_design",
    methodCode: "human_design_classic",
    render: async (job) => humanDesignRenderer.render(await humanDesignSource.load(job))
  }
]);
const storage = createS3CalculationPdfObjectStorage(config.storage);
const queue = createCalculationPdfQueue(config.redisUrl);
const worker = createCalculationPdfWorker(
  config.redisUrl,
  async (job) => {
    const attempts = job.opts.attempts ?? 1;
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    if (job.name === calculationPdfRenderJobName && "jobId" in job.data) {
      await processCalculationPdfJob({
        jobId: job.data.jobId,
        finalAttempt,
        store: pdfJobStore,
        mediaStore,
        registry,
        storage,
        now: new Date(),
        logger
      });
      return;
    }
    if (job.name === calculationPdfDeleteJobName && "mediaAssetId" in job.data) {
      await processCalculationPdfCleanup({
        mediaAssetId: job.data.mediaAssetId,
        store: pdfCleanupStore,
        storage
      });
      return;
    }
    throw new UnrecoverableError("Unsupported calculation PDF queue job");
  },
  config.calculationPdfConcurrency
);
const stopWorkerObservation = observeCalculationPdfWorker(worker, logger);
const readinessChecks = {
  postgres: async () => {
    await postgres.pool.query("select 1");
  },
  calculationPdfQueue: async () => {
    await queue.waitUntilReady();
  },
  calculationPdfWorker: async () => {
    await worker.waitUntilReady();
  },
  privateObjectStorage: async () => storage.checkReady()
};
const healthServer = createWorkerReadinessServer({
  getReadiness: () => createWorkerReadiness({ service, checks: readinessChecks })
});
const relay = createCalculationPdfOutboxRelay({
  intervalMs: config.outboxRelayIntervalMs,
  relayOnce: async () => {
    const now = new Date();
    await relayPendingCalculationPdfEvents({
      store: outboxStore,
      queue,
      now,
      batchSize: config.outboxRelayBatchSize,
      publishingLockTimeoutMs: config.outboxLockTimeoutMs,
      queueOptions: {
        attempts: config.calculationPdfAttempts,
        backoffMs: config.calculationPdfBackoffMs,
        jitter: config.calculationPdfJitter
      },
      logger
    });
    await relayPendingFlowRuntimeDispatchEvents({
      store: flowRuntimeDispatchOutboxStore,
      dispatch: (event) =>
        dispatchFlowRuntimeEvent({
          flowStore,
          runtimeStore: flowRuntimeStore,
          ...event
        }),
      now,
      batchSize: config.outboxRelayBatchSize,
      publishingLockTimeoutMs: config.outboxLockTimeoutMs,
      maxAttempts: config.flowRuntimeOutboxMaxAttempts,
      logger
    });
  },
  onError: (error) => logger.error("calculation PDF outbox relay failed", { error })
});
let shutdownPromise: Promise<void> | null = null;

async function startup(): Promise<void> {
  const readiness = await createWorkerReadiness({ service, checks: readinessChecks });
  if (readiness.status !== "ready") {
    throw new Error("Calculation PDF worker dependencies are not ready");
  }
  await new Promise<void>((resolve, reject) => {
    healthServer.once("error", reject);
    healthServer.listen(config.healthPort, config.healthHost, () => {
      healthServer.off("error", reject);
      resolve();
    });
  });
  await relay.runOnce();
  relay.start();
  logger.info("calculation PDF worker ready", readiness);
}

function shutdown(): Promise<void> {
  shutdownPromise ??= shutdownOnce();
  return shutdownPromise;
}

async function shutdownOnce(): Promise<void> {
  await relay.stop();
  if (healthServer.listening) {
    await new Promise<void>((resolve, reject) =>
      healthServer.close((error) => (error ? reject(error) : resolve()))
    );
  }
  stopWorkerObservation();
  await worker.close();
  await queue.close();
  await postgres.close();
}

startup().catch((error: unknown) => {
  shutdown().finally(() => {
    logger.error("calculation PDF worker startup failed", { error });
    process.exit(1);
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error("calculation PDF worker shutdown failed", { error });
        process.exit(1);
      });
  });
}
