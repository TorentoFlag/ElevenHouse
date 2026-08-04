import { performance } from "node:perf_hooks";
import {
  chartAstrocartographyCalculationRequestSchema,
  chartAstrocartographyJobInputSnapshotSchema,
  chartCompositeCalculationRequestSchema,
  chartExecutionProfileSchema,
  chartHoraryCalculationRequestSchema,
  chartHoraryJobInputSnapshotSchema,
  chartInputSnapshotSchema,
  chartNatalCalculationRequestSchema,
  chartProgressionCalculationRequestSchema,
  chartProgressionJobInputSnapshotSchema,
  chartRelationshipJobInputSnapshotSchema,
  chartSettingsSchema,
  chartSolarReturnCalculationRequestSchema,
  chartSolarReturnJobInputSnapshotSchema,
  chartSynastryCalculationRequestSchema,
  chartTransitCalculationRequestSchema,
  chartTransitJobInputSnapshotSchema,
  type ChartAstrocartographyCalculationRequest,
  type ChartCompositeCalculationRequest,
  type ChartCalculationMethod,
  type ChartExecutionProfile,
  type ChartHoraryCalculationRequest,
  type ChartNatalCalculationRequest,
  type ChartProgressionCalculationRequest,
  type ChartSolarReturnCalculationRequest,
  type ChartSynastryCalculationRequest,
  type ChartTransitCalculationRequest,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import {
  ChartEngineConfigurationError,
  ChartEnginePermanentError,
  type ChartEngineRequestOptions
} from "@elevenhouse/chart-engine-client";
import {
  ChartCalculationCompletionError,
  ChartCalculationReplacementError,
  sha256CanonicalJson,
  type CanonicalJson,
  type ChartJobForProcessing,
  type ChartJobProcessingStore
} from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";
import type { Logger } from "@elevenhouse/observability";
import { UnrecoverableError } from "bullmq";

type ChartEngineReadinessOptions = ChartEngineRequestOptions & {
  readonly expectedProfile: ChartExecutionProfile;
};

type ExecutionAbortReason = "timeout" | "shutdown" | "lease_lost" | "lease_unconfirmed";

type SafeChartFailure = {
  readonly code: string;
  readonly reason: string;
  readonly disposition: "retryable" | "permanent";
};

type PreClaimReadinessOutcome =
  | { readonly kind: "ready" }
  | { readonly kind: "defer" }
  | { readonly kind: "permanent"; readonly error: unknown };

export type ChartCalculationDeliveryControl = {
  readonly deferFor: (delayMs: number) => Promise<never>;
};

type ChartJobProcessingOutcome =
  | "unexpected_failure"
  | "deferred"
  | "not_claimable_terminal"
  | "retry_exhausted"
  | "retry_scheduled"
  | "permanent_failure"
  | "lease_lost"
  | "lease_unconfirmed"
  | "fence_rejected"
  | "succeeded";

type ChartJobProcessingObservation = {
  method: ChartCalculationMethod | "unresolved";
  durableAttempt: number | null;
  maxAttempts: number | null;
  leaseGeneration: number | null;
  leaseExpiresAt: string | null;
  outcome: ChartJobProcessingOutcome;
  retryScheduled: boolean;
  errorCode: string | null;
};

export type ChartEngineClient = {
  readonly checkReady: (options: ChartEngineReadinessOptions) => Promise<unknown>;
  readonly calculateNatal: (
    payload: ChartNatalCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
  readonly calculateTransit: (
    payload: ChartTransitCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
  readonly calculateSynastry: (
    payload: ChartSynastryCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
  readonly calculateComposite: (
    payload: ChartCompositeCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
  readonly calculateSolarReturn: (
    payload: ChartSolarReturnCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
  readonly calculateProgression: (
    payload: ChartProgressionCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
  readonly calculateHorary: (
    payload: ChartHoraryCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
  readonly calculateAstrocartography: (
    payload: ChartAstrocartographyCalculationRequest,
    options?: ChartEngineRequestOptions
  ) => Promise<ReproducibleChartResult>;
};

async function checkEngineReadyBeforeClaim(input: {
  readonly engine: ChartEngineClient;
  readonly expectedProfile: ChartExecutionProfile;
  readonly timeoutMs: number;
  readonly shutdownSignal: AbortSignal;
}): Promise<PreClaimReadinessOutcome> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  input.shutdownSignal.addEventListener("abort", abort, { once: true });
  if (input.shutdownSignal.aborted) abort();
  const timeout = setTimeout(abort, input.timeoutMs);
  timeout.unref();
  try {
    await input.engine.checkReady({
      expectedProfile: input.expectedProfile,
      signal: controller.signal
    });
    return { kind: "ready" };
  } catch (error) {
    return error instanceof ChartEngineConfigurationError ||
      error instanceof ChartEnginePermanentError
      ? { kind: "permanent", error }
      : { kind: "defer" };
  } finally {
    clearTimeout(timeout);
    input.shutdownSignal.removeEventListener("abort", abort);
  }
}

function executionProfilesMatch(
  left: ChartExecutionProfile,
  right: ChartExecutionProfile
): boolean {
  return (
    left.provider === right.provider &&
    left.kerykeionVersion === right.kerykeionVersion &&
    left.pyswissephVersion === right.pyswissephVersion &&
    left.expectedEphemeris === right.expectedEphemeris &&
    equalStringSets(left.expectedEphemerisFlags, right.expectedEphemerisFlags) &&
    left.expectedEphemerisDataRevision === right.expectedEphemerisDataRevision
  );
}

function equalStringSets(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

type ProcessChartCalculationJobInput = {
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly calculationTimeoutMs: number;
  readonly storageOperationTimeoutMs: number;
  readonly retryDelayMs: number;
  readonly retryJitter: number;
  readonly delivery: ChartCalculationDeliveryControl;
  readonly shutdownSignal: AbortSignal;
  readonly store: ChartJobProcessingStore;
  readonly engine: ChartEngineClient;
  readonly logger: Pick<Logger, "info" | "warn" | "error">;
};

export async function processChartCalculationJob(
  input: ProcessChartCalculationJobInput
): Promise<void> {
  const startedAt = performance.now();
  const observation: ChartJobProcessingObservation = {
    method: "unresolved",
    durableAttempt: null,
    maxAttempts: null,
    leaseGeneration: null,
    leaseExpiresAt: null,
    outcome: "unexpected_failure",
    retryScheduled: false,
    errorCode: "chart_job_processing_failed"
  };
  try {
    await executeChartCalculationJob(input, observation);
  } finally {
    logChartJobProcessing(input, observation, startedAt);
  }
}

async function executeChartCalculationJob(
  input: ProcessChartCalculationJobInput,
  observation: ChartJobProcessingObservation
): Promise<void> {
  let readiness: PreClaimReadinessOutcome | null = null;
  let executionProfileSnapshot: ChartExecutionProfile | null = null;
  try {
    const rawExecutionProfile = await runStorageOperation(
      () => input.store.getPreClaimExecutionProfile(input.jobId),
      input.storageOperationTimeoutMs
    );
    if (rawExecutionProfile !== null) {
      const parsedExecutionProfile = chartExecutionProfileSchema.safeParse(rawExecutionProfile);
      if (parsedExecutionProfile.success) {
        executionProfileSnapshot = parsedExecutionProfile.data;
        readiness = await checkEngineReadyBeforeClaim({
          engine: input.engine,
          expectedProfile: executionProfileSnapshot,
          timeoutMs: input.calculationTimeoutMs,
          shutdownSignal: input.shutdownSignal
        });
        if (readiness.kind === "defer") {
          return deferObserved(input, observation, {
            delayMs: input.retryDelayMs,
            outcome: "deferred",
            errorCode: "chart_provider_not_ready"
          });
        }
      } else {
        readiness = { kind: "permanent", error: parsedExecutionProfile.error };
      }
    }
  } catch {
    return deferObserved(input, observation, {
      delayMs: input.retryDelayMs,
      outcome: "deferred",
      errorCode: "chart_preclaim_storage_unavailable"
    });
  }

  let claim: Awaited<ReturnType<ChartJobProcessingStore["claimForProcessing"]>>;
  try {
    claim = await runStorageOperation(
      () =>
        input.store.claimForProcessing({
          jobId: input.jobId,
          workerId: input.workerId,
          leaseMs: input.leaseMs
        }),
      input.storageOperationTimeoutMs
    );
  } catch {
    return deferObserved(input, observation, {
      delayMs: input.retryDelayMs,
      outcome: "deferred",
      errorCode: "chart_claim_storage_unavailable"
    });
  }
  if (claim.kind === "not_claimable") {
    let state: Awaited<ReturnType<ChartJobProcessingStore["getDeliveryState"]>>;
    try {
      state = await runStorageOperation(
        () => input.store.getDeliveryState(input.jobId),
        input.storageOperationTimeoutMs
      );
    } catch {
      return deferObserved(input, observation, {
        delayMs: input.retryDelayMs,
        outcome: "deferred",
        errorCode: "chart_delivery_state_unavailable"
      });
    }
    if (state !== null) {
      observation.durableAttempt = state.attempts;
      observation.maxAttempts = state.maxAttempts;
    }
    if (state === null || state.kind === "succeeded" || state.kind === "failed") {
      observation.outcome = "not_claimable_terminal";
      observation.errorCode = null;
      return;
    }
    return deferObserved(input, observation, {
      delayMs: state.kind === "processing" ? input.leaseMs : input.retryDelayMs,
      outcome: "deferred",
      errorCode: "chart_job_not_claimable"
    });
  }
  if (claim.kind === "exhausted") {
    observation.durableAttempt = claim.attempts;
    observation.maxAttempts = claim.maxAttempts;
    observation.outcome = "retry_exhausted";
    observation.errorCode = "chart_job_retry_exhausted";
    throw new UnrecoverableError(
      "CHART_JOB_RETRY_EXHAUSTED: Chart calculation retry budget was exhausted"
    );
  }

  observeClaim(observation, claim.job);

  if (
    executionProfileSnapshot !== null &&
    !executionProfilesMatch(executionProfileSnapshot, claim.job.executionProfile)
  ) {
    readiness = {
      kind: "permanent",
      error: new ChartEngineConfigurationError("CHART_ENGINE_READY_PROFILE_MISMATCH")
    };
  }
  if (readiness === null) {
    return persistChartFailure(
      input,
      claim.job,
      {
        code: "chart_job_readiness_profile_unavailable",
        reason: "Chart job readiness profile is unavailable",
        disposition: "permanent"
      },
      observation
    );
  }

  const controller = new AbortController();
  let abortReason: ExecutionAbortReason | null = null;
  const abort = (reason: ExecutionAbortReason): void => {
    if (abortReason !== null) return;
    abortReason = reason;
    controller.abort();
  };
  const onShutdown = (): void => abort("shutdown");
  input.shutdownSignal.addEventListener("abort", onShutdown, { once: true });
  if (input.shutdownSignal.aborted) onShutdown();
  const timeout = setTimeout(() => abort("timeout"), input.calculationTimeoutMs);
  timeout.unref();
  const heartbeat = createLeaseHeartbeat({
    jobId: claim.job.id,
    workerId: input.workerId,
    leaseGeneration: claim.job.lease.leaseGeneration,
    leaseMs: input.leaseMs,
    storageOperationTimeoutMs: input.storageOperationTimeoutMs,
    extendLease: (extension) => input.store.extendLease(extension),
    onLeaseLost: () => abort("lease_lost"),
    onHeartbeatError: () => abort("lease_unconfirmed")
  });

  try {
    let result: ReproducibleChartResult;
    try {
      if (readiness.kind === "permanent") throw readiness.error;
      result = await calculateChartResult({
        job: claim.job,
        engine: input.engine,
        signal: controller.signal
      });
    } catch (error) {
      await heartbeat.stop();
      return handleChartExecutionFailure(input, claim.job, error, abortReason, observation);
    }
    if (abortReason !== null) {
      await heartbeat.stop();
      return handleChartExecutionFailure(
        input,
        claim.job,
        new Error("Chart execution was cancelled"),
        abortReason,
        observation
      );
    }

    let completed: boolean;
    try {
      completed = await runStorageOperation(
        () =>
          input.store.complete({
            jobId: claim.job.id,
            workerId: input.workerId,
            leaseGeneration: claim.job.lease.leaseGeneration,
            result,
            resultChecksum: sha256CanonicalJson(result as unknown as CanonicalJson)
          }),
        input.storageOperationTimeoutMs
      );
    } catch (error) {
      await heartbeat.stop();
      if (abortReason === "lease_lost" || abortReason === "lease_unconfirmed") {
        return deferObserved(input, observation, {
          delayMs: input.leaseMs,
          outcome: abortReason,
          errorCode:
            abortReason === "lease_lost" ? "chart_job_lease_lost" : "chart_job_lease_unconfirmed"
        });
      }
      if (
        error instanceof ChartCalculationCompletionError ||
        error instanceof ChartCalculationReplacementError
      ) {
        return persistChartFailure(
          input,
          claim.job,
          classifyFailure(error, abortReason),
          observation
        );
      }
      return deferObserved(input, observation, {
        delayMs: input.leaseMs,
        outcome: "deferred",
        errorCode: "chart_completion_storage_unavailable"
      });
    }
    await heartbeat.stop();
    if (abortReason !== null) {
      return deferObserved(input, observation, {
        delayMs: input.leaseMs,
        outcome:
          abortReason === "lease_lost" || abortReason === "lease_unconfirmed"
            ? abortReason
            : "deferred",
        errorCode:
          abortReason === "lease_lost"
            ? "chart_job_lease_lost"
            : abortReason === "lease_unconfirmed"
              ? "chart_job_lease_unconfirmed"
              : "chart_completion_unconfirmed"
      });
    }
    if (!completed) {
      return deferObserved(input, observation, {
        delayMs: input.leaseMs,
        outcome: "fence_rejected",
        errorCode: "chart_completion_fence_rejected"
      });
    }
    observation.outcome = "succeeded";
    observation.retryScheduled = false;
    observation.errorCode = null;
  } finally {
    await heartbeat.stop();
    clearTimeout(timeout);
    input.shutdownSignal.removeEventListener("abort", onShutdown);
  }
}

function observeClaim(
  observation: ChartJobProcessingObservation,
  job: ChartJobForProcessing
): void {
  observation.method = job.method;
  observation.durableAttempt = job.attempts;
  observation.maxAttempts = job.maxAttempts;
  observation.leaseGeneration = job.lease.leaseGeneration;
  observation.leaseExpiresAt = job.lease.lockedUntil;
}

function deferObserved(
  input: Pick<ProcessChartCalculationJobInput, "delivery">,
  observation: ChartJobProcessingObservation,
  update: {
    readonly delayMs: number;
    readonly outcome: Extract<
      ChartJobProcessingOutcome,
      "deferred" | "lease_lost" | "lease_unconfirmed" | "fence_rejected"
    >;
    readonly errorCode: string;
  }
): Promise<never> {
  observation.outcome = update.outcome;
  observation.retryScheduled = true;
  observation.errorCode = update.errorCode;
  return input.delivery.deferFor(update.delayMs);
}

function logChartJobProcessing(
  input: Pick<ProcessChartCalculationJobInput, "jobId" | "logger">,
  observation: ChartJobProcessingObservation,
  startedAt: number
): void {
  const fields = {
    jobId: safeJobId(input.jobId),
    method: observation.method,
    durationMs: performance.now() - startedAt,
    outcome: observation.outcome,
    retryScheduled: observation.retryScheduled,
    ...(observation.durableAttempt === null ? {} : { durableAttempt: observation.durableAttempt }),
    ...(observation.maxAttempts === null ? {} : { maxAttempts: observation.maxAttempts }),
    ...(observation.leaseGeneration === null
      ? {}
      : { leaseGeneration: observation.leaseGeneration }),
    ...(observation.leaseExpiresAt === null
      ? {}
      : { leaseExpiresAt: safeLeaseExpiry(observation.leaseExpiresAt) }),
    ...(observation.errorCode === null ? {} : { errorCode: safeErrorCode(observation.errorCode) })
  };
  if (observation.outcome === "succeeded" || observation.outcome === "not_claimable_terminal") {
    input.logger.info("chart calculation job processed", fields);
    return;
  }
  if (
    observation.outcome === "deferred" ||
    observation.outcome === "retry_scheduled" ||
    observation.outcome === "lease_lost" ||
    observation.outcome === "lease_unconfirmed" ||
    observation.outcome === "fence_rejected"
  ) {
    input.logger.warn("chart calculation job processed", fields);
    return;
  }
  input.logger.error("chart calculation job processed", fields);
}

function safeJobId(value: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
    ? value
    : "invalid";
}

function safeLeaseExpiry(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ? value : "invalid";
}

function safeErrorCode(value: string): string {
  return value.length <= 128 && /^(?:chart_[a-z0-9_]+|CHART_[A-Z0-9_]+)$/u.test(value)
    ? value
    : "chart_job_processing_failed";
}

async function handleChartExecutionFailure(
  input: {
    readonly workerId: string;
    readonly leaseMs: number;
    readonly retryDelayMs: number;
    readonly retryJitter: number;
    readonly storageOperationTimeoutMs: number;
    readonly store: ChartJobProcessingStore;
    readonly delivery: ChartCalculationDeliveryControl;
  },
  job: ChartJobForProcessing,
  error: unknown,
  abortReason: ExecutionAbortReason | null,
  observation: ChartJobProcessingObservation
): Promise<void> {
  if (abortReason === "lease_lost" || abortReason === "lease_unconfirmed") {
    return deferObserved(input, observation, {
      delayMs: input.leaseMs,
      outcome: abortReason,
      errorCode:
        abortReason === "lease_lost" ? "chart_job_lease_lost" : "chart_job_lease_unconfirmed"
    });
  }
  return persistChartFailure(input, job, classifyFailure(error, abortReason), observation);
}

async function persistChartFailure(
  input: {
    readonly workerId: string;
    readonly leaseMs: number;
    readonly retryDelayMs: number;
    readonly retryJitter: number;
    readonly storageOperationTimeoutMs: number;
    readonly store: ChartJobProcessingStore;
    readonly delivery: ChartCalculationDeliveryControl;
  },
  job: ChartJobForProcessing,
  failure: SafeChartFailure,
  observation: ChartJobProcessingObservation
): Promise<void> {
  const retryDelayMs = calculateRetryDelayMs({
    baseDelayMs: input.retryDelayMs,
    attempts: job.attempts,
    jitter: input.retryJitter
  });
  let outcome: Awaited<ReturnType<ChartJobProcessingStore["recordAttemptFailure"]>>;
  try {
    outcome = await runStorageOperation(
      () =>
        input.store.recordAttemptFailure({
          jobId: job.id,
          workerId: input.workerId,
          leaseGeneration: job.lease.leaseGeneration,
          ...failure,
          retryDelayMs
        }),
      input.storageOperationTimeoutMs
    );
  } catch {
    return deferObserved(input, observation, {
      delayMs: input.leaseMs,
      outcome: "deferred",
      errorCode: "chart_failure_persistence_unavailable"
    });
  }
  if (outcome === null) {
    return deferObserved(input, observation, {
      delayMs: input.leaseMs,
      outcome: "fence_rejected",
      errorCode: "chart_failure_fence_rejected"
    });
  }
  observation.durableAttempt = outcome.attempts;
  observation.maxAttempts = outcome.maxAttempts;
  observation.errorCode = failure.code;
  if (outcome.kind === "requeued") {
    observation.outcome = "retry_scheduled";
    observation.retryScheduled = true;
    return;
  }
  observation.outcome =
    failure.disposition === "retryable" ? "retry_exhausted" : "permanent_failure";
  observation.retryScheduled = false;
  throw createUnrecoverableError(failure);
}

function calculateRetryDelayMs(input: {
  readonly baseDelayMs: number;
  readonly attempts: number;
  readonly jitter: number;
}): number {
  if (!Number.isSafeInteger(input.baseDelayMs) || input.baseDelayMs < 1) {
    throw new Error("CHART_JOB_RETRY_DELAY_INVALID");
  }
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1) {
    throw new Error("CHART_JOB_ATTEMPTS_INVALID");
  }
  if (!Number.isFinite(input.jitter) || input.jitter < 0 || input.jitter > 1) {
    throw new Error("CHART_JOB_RETRY_JITTER_INVALID");
  }
  const maximumDelayMs = Math.min(
    24 * 60 * 60 * 1_000,
    input.baseDelayMs * 2 ** (input.attempts - 1)
  );
  return Math.max(1, Math.round(maximumDelayMs * (1 - input.jitter * Math.random())));
}

function createLeaseHeartbeat(input: {
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseGeneration: number;
  readonly leaseMs: number;
  readonly storageOperationTimeoutMs: number;
  readonly extendLease: ChartJobProcessingStore["extendLease"];
  readonly onLeaseLost: () => void;
  readonly onHeartbeatError: () => void;
}): { readonly stop: () => Promise<void> } {
  const intervalMs = Math.max(1, Math.floor((input.leaseMs - 1) / 2));
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
    timer.unref();
  };
  const run = (): void => {
    if (stopped || inFlight) return;
    const operation = runStorageOperation(
      () =>
        input.extendLease({
          jobId: input.jobId,
          workerId: input.workerId,
          leaseGeneration: input.leaseGeneration,
          leaseMs: input.leaseMs
        }),
      input.storageOperationTimeoutMs
    )
      .then((lease) => {
        if (lease === null) {
          stopped = true;
          input.onLeaseLost();
        }
      })
      .catch(() => {
        stopped = true;
        input.onHeartbeatError();
      })
      .finally(() => {
        if (inFlight === operation) inFlight = null;
        schedule();
      });
    inFlight = operation;
  };

  schedule();
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await inFlight;
    }
  };
}

async function runStorageOperation<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("CHART_STORAGE_OPERATION_DEADLINE_EXCEEDED")),
          timeoutMs
        );
        timer.unref();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyFailure(
  error: unknown,
  abortReason: ExecutionAbortReason | null
): SafeChartFailure {
  if (abortReason === "timeout") {
    return {
      code: "chart_provider_timeout",
      reason: "Chart calculation exceeded its durable timeout",
      disposition: "retryable"
    };
  }
  if (abortReason === "shutdown") {
    return {
      code: "chart_worker_shutdown",
      reason: "Chart worker stopped during calculation",
      disposition: "retryable"
    };
  }
  if (
    error instanceof ChartEnginePermanentError ||
    error instanceof ChartEngineConfigurationError
  ) {
    return {
      code: error.code,
      reason:
        error instanceof ChartEngineConfigurationError
          ? "Chart engine configuration does not match the calculation profile"
          : "Chart engine rejected the calculation request",
      disposition: "permanent"
    };
  }
  if (error instanceof ChartCalculationReplacementError) {
    return {
      code: error.code,
      reason: "Chart calculation replacement was rejected",
      disposition: "permanent"
    };
  }
  if (error instanceof ChartCalculationCompletionError) {
    return {
      code: error.code,
      reason: "Chart calculation completion was rejected",
      disposition: "permanent"
    };
  }
  if (error instanceof z.ZodError || error instanceof UnrecoverableError) {
    return {
      code: "chart_job_input_invalid",
      reason: "Chart job input does not match its durable contract",
      disposition: "permanent"
    };
  }
  return {
    code: "chart_provider_transient_failure",
    reason: "Chart engine calculation failed",
    disposition: "retryable"
  };
}

function createUnrecoverableError(failure: SafeChartFailure): UnrecoverableError {
  return new UnrecoverableError(`${failure.code}: ${failure.reason}`);
}

async function calculateChartResult(input: {
  readonly job: ChartJobForProcessing;
  readonly engine: ChartEngineClient;
  readonly signal: AbortSignal;
}): Promise<ReproducibleChartResult> {
  const settings = chartSettingsSchema.parse(input.job.settingsSnapshot);
  if (input.job.method === "natal") {
    const request = chartNatalCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "natal",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      inputSnapshot: chartInputSnapshotSchema.parse(input.job.inputSnapshot)
    });
    return input.engine.calculateNatal(request, { signal: input.signal });
  }
  if (input.job.method === "transit") {
    const snapshots = chartTransitJobInputSnapshotSchema.parse(input.job.inputSnapshot);
    const request = chartTransitCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "transit",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      transitSnapshot: snapshots.transitSnapshot
    });
    return input.engine.calculateTransit(request, { signal: input.signal });
  }
  if (input.job.method === "synastry") {
    const snapshots = chartRelationshipJobInputSnapshotSchema.parse(input.job.inputSnapshot);
    const request = chartSynastryCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "synastry",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      partnerInputSnapshot: snapshots.partnerInputSnapshot
    });
    return input.engine.calculateSynastry(request, { signal: input.signal });
  }
  if (input.job.method === "composite") {
    const snapshots = chartRelationshipJobInputSnapshotSchema.parse(input.job.inputSnapshot);
    const request = chartCompositeCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "composite",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      partnerInputSnapshot: snapshots.partnerInputSnapshot
    });
    return input.engine.calculateComposite(request, { signal: input.signal });
  }
  if (input.job.method === "solar_return") {
    const snapshots = chartSolarReturnJobInputSnapshotSchema.parse(input.job.inputSnapshot);
    const request = chartSolarReturnCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "solar_return",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      solarReturnSnapshot: snapshots.solarReturnSnapshot
    });
    return input.engine.calculateSolarReturn(request, { signal: input.signal });
  }
  if (input.job.method === "progression") {
    const snapshots = chartProgressionJobInputSnapshotSchema.parse(input.job.inputSnapshot);
    const request = chartProgressionCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "progression",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      progressionSnapshot: snapshots.progressionSnapshot
    });
    return input.engine.calculateProgression(request, { signal: input.signal });
  }
  if (input.job.method === "horary") {
    const snapshots = chartHoraryJobInputSnapshotSchema.parse(input.job.inputSnapshot);
    const request = chartHoraryCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "horary",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      questionSnapshot: snapshots.questionSnapshot
    });
    return input.engine.calculateHorary(request, { signal: input.signal });
  }
  if (input.job.method === "astrocartography") {
    const snapshots = chartAstrocartographyJobInputSnapshotSchema.parse(input.job.inputSnapshot);
    const request = chartAstrocartographyCalculationRequestSchema.parse({
      schemaVersion: "chart-request.v2",
      method: "astrocartography",
      methodVersion: input.job.methodVersion,
      executionProfile: input.job.executionProfile,
      settings,
      inputSnapshot: snapshots.inputSnapshot
    });
    return input.engine.calculateAstrocartography(request, { signal: input.signal });
  }
  throw new UnrecoverableError("Unsupported chart calculation method");
}
