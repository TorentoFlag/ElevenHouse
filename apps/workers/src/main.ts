import { randomUUID } from "node:crypto";
import { createClient } from "redis";

import { createLogger } from "@elevenhouse/observability";
import {
  createDrizzleFlowBookingEnrollmentStore,
  createDrizzleFlowClientEventEnrollmentStore,
  createDrizzleFlowBirthDataReadinessReader,
  createDrizzleFlowBirthProfileRecheckStore,
  createDrizzleFlowBookingLifecycleStore,
  createDrizzleFlowNatalChartAiDraftRequester,
  createDrizzleFlowNatalChartRequester,
  createDrizzleFlowMessagingRequester,
  createDrizzleFlowRuntimeOwnerSubjectStore,
  createDrizzleFlowRuntimeDispatchOutboxStore,
  createDrizzleFlowExecutionSignalStore,
  createDrizzleFlowApprovalWakeStore,
  createDrizzleFlowWorkItemWakeStore,
  createDrizzleFlowWorkerExecutionStore,
  createDrizzleFlowWorkerReadinessStore,
  runFlowEnrollmentControlOutcomeRetention,
  runFlowRuntimeControlOutcomeRetention,
  runFlowWorkerRegistrationRetention,
  createDrizzleAiUsageRecorder,
  createDrizzleAiUsageStore,
  createDrizzleSessionLifecycleStore
} from "@elevenhouse/db";
import {
  createDrizzleChartAiDraftCommandStore,
  createDrizzleChartCalculationCommandStore
} from "@elevenhouse/db/charts";
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
import {
  createBuiltInFlowNodeExecutorRegistry,
  createFlowBookingEnrollmentWorkerRequirementKeys,
  createFlowClientEventEnrollmentWorkerRequirementKeys,
  createFlowManualClientEnrollmentWorkerRequirementKeys,
  createFlowExecutionWorkerRequirementKeys,
  type AiUsageResourceEvidence,
  type AiUsageSafeErrorCode,
  resolveChartExecutionProfile
} from "@elevenhouse/domain";
import { getNatalChartAiDictionaryCodes } from "@elevenhouse/ai";
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
import { processNextFlowExecution } from "./flows/flow-execution.processor";
import { recoverExpiredFlowExecutions } from "./flows/flow-execution.recovery";
import { createFlowExecutionRuntime } from "./flows/flow-execution.runtime";
import { createFlowChartAiGenerator } from "./flows/flow-chart-ai-generator";
import { wakeDueFlowApprovals } from "./flows/flow-approval-wake";
import { wakeDueFlowWorkItems } from "./flows/flow-work-item-wake";
import { createFlowRuntimeControlMaintenance } from "./flows/flow-runtime-control.maintenance";
import { createFlowWorkerControl } from "./flows/flow-worker-control";
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";
import { relayPendingFlowRuntimeDispatchEvents } from "./flows/flow-runtime.outbox-relay";
import { createWorkersRuntimeConfig } from "./runtime-config";
import { shutdownWorkerRuntime } from "./worker-shutdown";
import { processSessionBookingLifecycleEvents } from "./sessions/session-booking-lifecycle.processor";
import { maintainSessions } from "./sessions/session-maintenance";
import { createSessionRuntime } from "./sessions/session-runtime";

const service = "workers";
const logger = createLogger(service);
const config = createWorkersRuntimeConfig();
const postgres = createPostgresRuntime();
const outboxStore = createDrizzleOutboxRelayStore(postgres.database);
const sessionLifecycleStore = createDrizzleSessionLifecycleStore(postgres.database);
const calculationStore = createDrizzleCalculationStore(postgres.database);
const flowWorkerSessionId = randomUUID();
const flowWorkerIdentity = {
  instanceId: config.flowExecution.instanceId,
  sessionId: flowWorkerSessionId
} as const;
const flowExecutionStore = createDrizzleFlowWorkerExecutionStore(
  postgres.database,
  flowWorkerIdentity
);
const flowRuntimeOwnerSubjectStore = createDrizzleFlowRuntimeOwnerSubjectStore(postgres.database);
const flowWorkerReadinessStore = createDrizzleFlowWorkerReadinessStore(postgres.database);
const flowRuntimeDispatchOutboxStore = createDrizzleFlowRuntimeDispatchOutboxStore(
  postgres.database
);
const flowExecutionSignalStore = createDrizzleFlowExecutionSignalStore(postgres.database);
const flowBookingEnrollmentStore = createDrizzleFlowBookingEnrollmentStore(
  postgres.database,
  flowWorkerIdentity
);
const flowClientEventEnrollmentStore = createDrizzleFlowClientEventEnrollmentStore(
  postgres.database
);
const flowBookingLifecycleStore = createDrizzleFlowBookingLifecycleStore(
  postgres.database,
  flowWorkerIdentity
);
const flowBirthDataReadinessReader = createDrizzleFlowBirthDataReadinessReader(postgres.database);
const flowBirthProfileRecheckStore = createDrizzleFlowBirthProfileRecheckStore(postgres.database);
const chartExecutionProfile = resolveChartExecutionProfile(process.env);
const flowNatalChartRequester = createDrizzleFlowNatalChartRequester(postgres.database, {
  commandStore: createDrizzleChartCalculationCommandStore(postgres.database),
  executionProfile: chartExecutionProfile
});
const flowMessagingRequester = createDrizzleFlowMessagingRequester(postgres.database);
const flowChartAiRedis = createClient({ url: config.redisUrl });
const flowChartAiRedisReady = flowChartAiRedis.connect();
const flowChartAiGenerator = createFlowChartAiGenerator({
  config: config.flowChartAi,
  redis: {
    eval: (script, options) =>
      flowChartAiRedisReady.then(() => flowChartAiRedis.eval(script, options))
  },
  usageRecorder: createDrizzleAiUsageRecorder(
    createDrizzleAiUsageStore(postgres.database)
  ) as import("@elevenhouse/ai").AiGenerationUsageRecorder<
    AiUsageResourceEvidence,
    AiUsageSafeErrorCode
  >
});
const flowNatalChartAiDraftRequester = createDrizzleFlowNatalChartAiDraftRequester(
  postgres.database,
  {
    calculationStore,
    dictionaryStore: createDrizzleDictionaryStore(postgres.database),
    commandStore: createDrizzleChartAiDraftCommandStore(postgres.database),
    executionProfile: chartExecutionProfile,
    getDictionaryCodes: getNatalChartAiDictionaryCodes,
    generate: ({ dictionaryCodes, ...request }) => {
      // Dictionary retrieval is Flow-owned preparation; the provider contract must not receive it.
      void dictionaryCodes;
      return flowChartAiGenerator.generate(request);
    }
  }
);
const flowWorkItemWakeStore = createDrizzleFlowWorkItemWakeStore(postgres.database);
const flowApprovalWakeStore = createDrizzleFlowApprovalWakeStore(postgres.database);
const dictionaryStore = createDrizzleDictionaryStore(postgres.database);
const pdfJobStore = createDrizzleCalculationPdfJobStore(postgres.database);
const pdfCleanupStore = createDrizzleCalculationPdfCleanupStore(postgres.database);
const mediaStore = createDrizzleMediaAssetStore(postgres.database);
const matrixReportStore = createDrizzleMatrixReportStore(postgres.database);
const matrixSource = createMatrixPdfSource(calculationStore, matrixReportStore);
const matrixRenderer = createMatrixPdfRenderer();
const numerologySource = createNumerologyPdfSource(calculationStore);
const numerologyRenderer = createNumerologyPdfRenderer();
const chartSource = createChartPdfSource(calculationStore, dictionaryStore, chartExecutionProfile);
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
const flowExecutorSupportedCapabilities = [
  "bookings.events.booking_confirmed",
  "products.read",
  "clients.birth_data.read.service_preparation",
  "charts.calculate.natal.booking_context",
  "charts.interpret.natal.ai_draft",
  "messaging.outbound.send.existing_thread"
] as const;
const flowNodeExecutorRegistry = createBuiltInFlowNodeExecutorRegistry({
  birthDataReadinessReader: flowBirthDataReadinessReader,
  natalChartRequester: flowNatalChartRequester,
  natalChartAiDraftRequester: flowNatalChartAiDraftRequester,
  messagingRequester: flowMessagingRequester
});
let flowWorkerControl: ReturnType<typeof createFlowWorkerControl> | null = null;
let flowWorkerFatalShutdownStarted = false;
const flowExecutionRuntime = createFlowExecutionRuntime({
  deploymentCeiling: { mode: config.flowExecution.deploymentCeiling.mode },
  pollIntervalMs: config.flowExecution.pollIntervalMs,
  pollBatchSize: config.flowExecution.pollBatchSize,
  recoveryIntervalMs: config.flowExecution.recoveryIntervalMs,
  workItemWakeIntervalMs: config.flowExecution.workItemWakeIntervalMs,
  approvalWakeIntervalMs: config.flowExecution.approvalWakeIntervalMs,
  operationTimeoutMs: config.flowExecution.operationTimeoutMs,
  drainTimeoutMs: config.flowExecution.drainTimeoutMs,
  errorBackoffMaxMs: config.flowExecution.errorBackoffMaxMs,
  errorJitter: config.flowExecution.errorJitter,
  processNext: () =>
    flowWorkerControl?.isClaimingAllowed()
      ? processNextFlowExecution({
          store: flowExecutionStore,
          registry: flowNodeExecutorRegistry,
          logger
        })
      : Promise.resolve({ status: "idle" as const }),
  recoverExpired: () =>
    recoverExpiredFlowExecutions({
      store: flowExecutionStore,
      limit: config.flowExecution.recoveryBatchSize,
      logger
    }),
  wakeDueWorkItems: () =>
    wakeDueFlowWorkItems({
      store: flowWorkItemWakeStore,
      limit: config.flowExecution.workItemWakeBatchSize,
      logger
    }),
  wakeDueApprovals: () =>
    wakeDueFlowApprovals({
      store: flowApprovalWakeStore,
      limit: config.flowExecution.approvalWakeBatchSize,
      logger
    }),
  logger
});
const sessionRuntime = createSessionRuntime({
  projectionIntervalMs: config.sessions.projectionIntervalMs,
  maintenanceIntervalMs: config.sessions.maintenanceIntervalMs,
  project: () =>
    config.sessions.enabled
      ? processSessionBookingLifecycleEvents({
          store: sessionLifecycleStore,
          now: new Date(),
          batchSize: config.sessions.projectionBatchSize
        })
      : Promise.resolve(),
  maintain: () =>
    config.sessions.enabled
      ? maintainSessions({
          store: sessionLifecycleStore,
          now: new Date(),
          batchSize: config.sessions.maintenanceBatchSize
        })
      : Promise.resolve(),
  onError: (operation, error) =>
    logger.error("session runtime operation failed", { operation, error })
});
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
  privateObjectStorage: async () => storage.checkReady(),
  flowChartAi: async () => {
    await flowChartAiRedisReady;
  },
  flowExecutionRuntime: async () => {
    const readiness = flowExecutionRuntime.getOperationalReadiness();
    if (readiness.status !== "ready") throw new Error(readiness.errorCode);
  },
  flowWorkerControl: async () => {
    const readiness = flowWorkerControl?.getOperationalReadiness();
    if (!readiness || readiness.status !== "ready") {
      throw new Error(readiness?.errorCode ?? "flow_worker_readiness_not_initialized");
    }
  },
  sessions: async () => {
    const readiness = sessionRuntime.getOperationalReadiness();
    if (readiness.status !== "ready") throw new Error(readiness.errorCode);
  }
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
    if (!flowWorkerControl?.isClaimingAllowed()) return;
    await relayPendingFlowRuntimeDispatchEvents({
      store: flowRuntimeDispatchOutboxStore,
      enrollBookingConfirmed: (request) =>
        flowBookingEnrollmentStore.enrollBookingConfirmed({
          request,
          latenessHorizonMs: config.flowBookingEnrollment.latenessHorizonMs,
          futureSkewToleranceMs: config.flowBookingEnrollment.futureSkewToleranceMs
        }),
      enrollClientEvent: (request) => flowClientEventEnrollmentStore.enrollClientEvent({ request }),
      processBookingLifecycleEvent: (lifecycleEventId) =>
        flowBookingLifecycleStore.processBookingLifecycleEvent({
          lifecycleEventId,
          latenessHorizonMs: config.flowBookingEnrollment.latenessHorizonMs,
          futureSkewToleranceMs: config.flowBookingEnrollment.futureSkewToleranceMs
        }),
      deliverChartTerminalSignal: (signal) =>
        flowExecutionSignalStore.ingest({
          sourceEventId: signal.sourceEventId,
          ownerUserId: signal.ownerUserId,
          signalType: "chart.calculation.terminal.v1",
          correlationId: signal.jobId,
          outcome: signal.outcome,
          occurredAt: signal.occurredAt
        }),
      deliverMessagingTerminalSignal: (signal) =>
        flowExecutionSignalStore.ingest({
          sourceEventId: signal.sourceEventId,
          ownerUserId: signal.ownerUserId,
          signalType: "messaging.message.delivery.terminal.v1",
          correlationId: signal.messageId,
          outcome: signal.outcome,
          occurredAt: signal.occurredAt
        }),
      recheckBirthProfile: (input) => flowBirthProfileRecheckStore.recheck(input),
      now,
      batchSize: config.outboxRelayBatchSize,
      publishingLockTimeoutMs: config.outboxLockTimeoutMs,
      maxAttempts: config.flowRuntimeOutboxMaxAttempts,
      enrollmentDeferDelayMs: config.flowBookingEnrollment.deferDelayMs,
      logger
    });
  },
  onError: (error) => logger.error("calculation PDF outbox relay failed", { error })
});
const flowRuntimeControlMaintenance = createFlowRuntimeControlMaintenance({
  intervalMs: config.flowRuntimeControl.maintenanceIntervalMs,
  runOnce: async () => {
    const enrollmentOutcomeRetention = await runFlowEnrollmentControlOutcomeRetention(
      postgres.database,
      {
        batchSize: config.flowRuntimeControl.retentionBatchSize
      }
    );
    const outcomeRetention = await runFlowRuntimeControlOutcomeRetention(postgres.database, {
      batchSize: config.flowRuntimeControl.retentionBatchSize
    });
    const registrationRetention = await runFlowWorkerRegistrationRetention(postgres.database, {
      batchSize: config.flowRuntimeControl.retentionBatchSize
    });
    if (
      enrollmentOutcomeRetention.purged > 0 ||
      outcomeRetention.purged > 0 ||
      registrationRetention.retired > 0 ||
      registrationRetention.purged > 0
    ) {
      logger.info("flow runtime control retention applied", {
        enrollmentCommandOutcomesPurged: enrollmentOutcomeRetention.purged,
        commandOutcomesPurged: outcomeRetention.purged,
        workerRegistrationsRetired: registrationRetention.retired,
        workerRegistrationsPurged: registrationRetention.purged
      });
    }
  },
  logger
});
let shutdownPromise: Promise<void> | null = null;

async function startup(): Promise<void> {
  await Promise.all([
    readinessChecks.postgres(),
    readinessChecks.calculationPdfQueue(),
    readinessChecks.calculationPdfWorker(),
    readinessChecks.privateObjectStorage(),
    readinessChecks.flowChartAi()
  ]);
  await flowExecutionRuntime.runRecoveryOnce();
  await flowRuntimeControlMaintenance.runOnce();
  await sessionRuntime.runOnce();
  flowWorkerControl = await initializeFlowWorkerControl();
  flowWorkerControl.start();
  await flowExecutionRuntime.runWorkItemWakeOnce();
  await flowExecutionRuntime.runApprovalWakeOnce();
  await flowExecutionRuntime.runExecutionOnce();
  flowExecutionRuntime.start();
  const readiness = await createWorkerReadiness({ service, checks: readinessChecks });
  if (readiness.status !== "ready") {
    throw new Error("Worker dependencies are not ready");
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
  flowRuntimeControlMaintenance.start();
  sessionRuntime.start();
  logger.info("worker runtime ready", {
    ...readiness,
    flowExecutionDeploymentCeiling: config.flowExecution.deploymentCeiling.mode,
    flowWorkerSessionId
  });
}

async function initializeFlowWorkerControl() {
  const ownerMappings = await flowRuntimeOwnerSubjectStore.resolveOrCreateActive({
    ownerUserIds:
      config.flowExecution.deploymentCeiling.mode === "canary"
        ? config.flowExecution.deploymentCeiling.ownerUserIds
        : []
  });
  const control = createFlowWorkerControl({
    store: flowWorkerReadinessStore,
    registration: {
      schemaVersion: "flow-worker-registration.v2",
      sessionId: flowWorkerSessionId,
      instanceId: config.flowExecution.instanceId,
      roles: ["enrollment", "executor"],
      maxRuntimeMode: config.flowExecution.deploymentCeiling.mode,
      maxCanaryOwnerSubjectIds: ownerMappings.map((mapping) => mapping.ownerSubjectId),
      requirementKeys: [
        ...new Set([
          ...createFlowBookingEnrollmentWorkerRequirementKeys(),
          ...createFlowClientEventEnrollmentWorkerRequirementKeys(),
          ...createFlowManualClientEnrollmentWorkerRequirementKeys(),
          ...createFlowExecutionWorkerRequirementKeys(
            flowNodeExecutorRegistry.executorKeys,
            flowExecutorSupportedCapabilities
          )
        ])
      ].sort(),
      deploymentId: config.flowRuntimeControl.deploymentId,
      buildId: config.flowRuntimeControl.buildId
    },
    heartbeatIntervalMaxMs: config.flowRuntimeControl.heartbeatIntervalMaxMs,
    logger,
    onFatal: (error) => {
      if (flowWorkerFatalShutdownStarted) return;
      flowWorkerFatalShutdownStarted = true;
      void shutdown()
        .catch(() => undefined)
        .finally(() => {
          logger.error("flow worker control terminated", {
            errorCode:
              "code" in error && typeof error.code === "string"
                ? error.code
                : "FLOW_WORKER_CONTROL_FATAL"
          });
          process.exit(1);
        });
    }
  });
  await control.register();
  return control;
}

function shutdown(): Promise<void> {
  shutdownPromise ??= shutdownOnce();
  return shutdownPromise;
}

async function shutdownOnce(): Promise<void> {
  await shutdownWorkerRuntime({
    beginDrain: () => flowWorkerControl?.beginDrain() ?? Promise.resolve(),
    stopConcurrent: [
      () => flowExecutionRuntime.stop(),
      () => flowWorkerControl?.stop() ?? Promise.resolve(),
      () => flowRuntimeControlMaintenance.stop(),
      () => sessionRuntime.stop(),
      () => relay.stop(),
      () => flowChartAiRedis.close()
    ],
    closeHealthServer: () =>
      healthServer.listening
        ? new Promise<void>((resolve, reject) =>
            healthServer.close((error) => (error ? reject(error) : resolve()))
          )
        : Promise.resolve(),
    stopWorkerObservation,
    closeCalculationWorker: () => worker.close(),
    closeQueue: () => queue.close(),
    closePostgres: () => postgres.close()
  });
}

startup().catch(async (error: unknown) => {
  try {
    await shutdown();
  } catch {
    logger.error("calculation PDF worker shutdown failed", {
      errorCode: "WORKER_SHUTDOWN_FAILED"
    });
  } finally {
    logger.error("calculation PDF worker startup failed", { error });
    process.exit(1);
  }
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
