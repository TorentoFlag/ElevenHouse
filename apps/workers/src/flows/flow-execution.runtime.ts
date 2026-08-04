import type { FlowExecutionOwnerScope } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

type FlowExecutionRollout =
  | { readonly mode: "definition_only" }
  | {
      readonly mode: "canary";
      readonly ownerScope: Extract<FlowExecutionOwnerScope, { readonly kind: "allowlist" }>;
    };
type FlowExecutionCanaryOwnerScope = Extract<
  FlowExecutionOwnerScope,
  { readonly kind: "allowlist" }
>;

type FlowExecutionTickResult = { readonly status: string };
type FlowExecutionRunSummary =
  | { readonly status: "disabled"; readonly processedCount: 0 }
  | { readonly status: "idle"; readonly processedCount: 0 }
  | { readonly status: "processed"; readonly processedCount: number };
type FlowRecoveryRunSummary = { readonly status: "disabled" } | FlowExecutionTickResult;
type FlowExecutionLifecycle = "idle" | "running" | "stopping" | "stopped";

const FLOW_EXECUTION_POLL_DEADLINE_EXCEEDED = "FLOW_EXECUTION_POLL_DEADLINE_EXCEEDED";
const FLOW_EXECUTION_RECOVERY_DEADLINE_EXCEEDED = "FLOW_EXECUTION_RECOVERY_DEADLINE_EXCEEDED";
const FLOW_EXECUTION_DRAIN_DEADLINE_EXCEEDED = "FLOW_EXECUTION_DRAIN_DEADLINE_EXCEEDED";

export function createFlowExecutionRuntime(input: {
  readonly rollout: FlowExecutionRollout;
  readonly pollIntervalMs: number;
  readonly pollBatchSize: number;
  readonly recoveryIntervalMs: number;
  readonly operationTimeoutMs: number;
  readonly drainTimeoutMs: number;
  readonly errorBackoffMaxMs: number;
  readonly errorJitter: number;
  readonly processNext: (
    ownerScope: FlowExecutionCanaryOwnerScope
  ) => Promise<FlowExecutionTickResult>;
  readonly recoverExpired: () => Promise<FlowExecutionTickResult>;
  readonly logger: Pick<Logger, "info" | "warn" | "error">;
}) {
  let accepting = true;
  let lifecycle: FlowExecutionLifecycle = "idle";
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let executionInFlight: Promise<FlowExecutionRunSummary> | null = null;
  let recoveryInFlight: Promise<FlowRecoveryRunSummary> | null = null;
  let executionDeadlineLogged = false;
  let recoveryDeadlineLogged = false;
  let executionLastSucceededAt: number | null = null;
  let recoveryLastSucceededAt: number | null = null;
  let executionLastFailedAt: number | null = null;
  let recoveryLastFailedAt: number | null = null;
  let executionLastErrorCode: string | null = null;
  let recoveryLastErrorCode: string | null = null;
  let executionScheduleFailures = 0;
  let recoveryScheduleFailures = 0;

  const canaryOwnerScope =
    input.rollout.mode === "canary" ? normalizeCanaryOwnerScope(input.rollout.ownerScope) : null;
  const claimingEnabled = canaryOwnerScope !== null;

  const startExecutionOperation = (): Promise<FlowExecutionRunSummary> => {
    if (!canaryOwnerScope) throw new Error("FLOW_EXECUTION_CANARY_SCOPE_INVALID");
    const operation = drainExecutionBatch(
      () => input.processNext(canaryOwnerScope),
      input.pollBatchSize,
      () => accepting
    );
    executionDeadlineLogged = false;
    const tracked = operation.then(
      (result) => {
        if (executionInFlight === tracked) executionInFlight = null;
        executionLastSucceededAt = Date.now();
        executionLastFailedAt = null;
        executionLastErrorCode = null;
        return result;
      },
      (error: unknown) => {
        if (executionInFlight === tracked) executionInFlight = null;
        executionLastFailedAt = Date.now();
        executionLastErrorCode = "flow_execution_poll_failed";
        input.logger.error("flow execution poll failed", {
          errorCode: "flow_execution_poll_failed"
        });
        throw error;
      }
    );
    executionInFlight = tracked;
    void tracked.catch(() => undefined);
    return tracked;
  };

  const runExecutionOnce = (): Promise<FlowExecutionRunSummary> => {
    if (!claimingEnabled || !accepting) {
      return Promise.resolve({ status: "disabled", processedCount: 0 });
    }
    const operation = executionInFlight ?? startExecutionOperation();
    return observeDeadline(operation, input.operationTimeoutMs, () => {
      if (!executionDeadlineLogged) {
        executionDeadlineLogged = true;
        executionLastFailedAt = Date.now();
        executionLastErrorCode = "flow_execution_poll_deadline_exceeded";
        input.logger.error("flow execution poll failed", {
          errorCode: "flow_execution_poll_deadline_exceeded"
        });
      }
      return new Error(FLOW_EXECUTION_POLL_DEADLINE_EXCEEDED);
    });
  };

  const startRecoveryOperation = (): Promise<FlowRecoveryRunSummary> => {
    const operation = input.recoverExpired();
    recoveryDeadlineLogged = false;
    const tracked = operation.then(
      (result) => {
        if (recoveryInFlight === tracked) recoveryInFlight = null;
        recoveryLastSucceededAt = Date.now();
        recoveryLastFailedAt = null;
        recoveryLastErrorCode = null;
        return result;
      },
      (error: unknown) => {
        if (recoveryInFlight === tracked) recoveryInFlight = null;
        recoveryLastFailedAt = Date.now();
        recoveryLastErrorCode = "flow_execution_recovery_failed";
        input.logger.error("flow execution recovery failed", {
          errorCode: "flow_execution_recovery_failed"
        });
        throw error;
      }
    );
    recoveryInFlight = tracked;
    void tracked.catch(() => undefined);
    return tracked;
  };

  const runRecoveryOnce = (): Promise<FlowRecoveryRunSummary> => {
    if (!accepting) return Promise.resolve({ status: "disabled" });
    const operation = recoveryInFlight ?? startRecoveryOperation();
    return observeDeadline(operation, input.operationTimeoutMs, () => {
      if (!recoveryDeadlineLogged) {
        recoveryDeadlineLogged = true;
        recoveryLastFailedAt = Date.now();
        recoveryLastErrorCode = "flow_execution_recovery_deadline_exceeded";
        input.logger.error("flow execution recovery failed", {
          errorCode: "flow_execution_recovery_deadline_exceeded"
        });
      }
      return new Error(FLOW_EXECUTION_RECOVERY_DEADLINE_EXCEEDED);
    });
  };

  const runInitial = async () => {
    if (!accepting) return { status: "disabled" } as const;
    const recovery = await runRecoveryOnce();
    const execution = await runExecutionOnce();
    return { status: "completed", recovery, execution } as const;
  };

  const scheduleExecution = (delayMs: number): void => {
    pollTimer = setTimeout(async () => {
      pollTimer = undefined;
      try {
        await runExecutionOnce();
        executionScheduleFailures = 0;
      } catch {
        executionScheduleFailures += 1;
      }
      if (accepting && lifecycle === "running") {
        scheduleExecution(
          nextScheduleDelay(
            input.pollIntervalMs,
            executionScheduleFailures,
            input.errorBackoffMaxMs,
            input.errorJitter
          )
        );
      }
    }, delayMs);
    pollTimer.unref();
  };

  const scheduleRecovery = (delayMs: number): void => {
    recoveryTimer = setTimeout(async () => {
      recoveryTimer = undefined;
      try {
        await runRecoveryOnce();
        recoveryScheduleFailures = 0;
      } catch {
        recoveryScheduleFailures += 1;
      }
      if (accepting && lifecycle === "running") {
        scheduleRecovery(
          nextScheduleDelay(
            input.recoveryIntervalMs,
            recoveryScheduleFailures,
            input.errorBackoffMaxMs,
            input.errorJitter
          )
        );
      }
    }, delayMs);
    recoveryTimer.unref();
  };

  const getOperationalReadiness = () => {
    if (lifecycle !== "running") {
      return {
        status: "unready" as const,
        mode: input.rollout.mode,
        lifecycle,
        errorCode: "flow_execution_runtime_not_running" as const
      };
    }
    const now = Date.now();
    const recoveryError = laneReadinessError({
      now,
      intervalMs: input.recoveryIntervalMs,
      operationTimeoutMs: input.operationTimeoutMs,
      lastSucceededAt: recoveryLastSucceededAt,
      lastFailedAt: recoveryLastFailedAt,
      lastErrorCode: recoveryLastErrorCode,
      prefix: "flow_execution_recovery"
    });
    if (recoveryError) {
      return {
        status: "unready" as const,
        mode: input.rollout.mode,
        lifecycle,
        errorCode: recoveryError
      };
    }
    if (claimingEnabled) {
      const executionError = laneReadinessError({
        now,
        intervalMs: input.pollIntervalMs,
        operationTimeoutMs: input.operationTimeoutMs,
        lastSucceededAt: executionLastSucceededAt,
        lastFailedAt: executionLastFailedAt,
        lastErrorCode: executionLastErrorCode,
        prefix: "flow_execution_poll"
      });
      if (executionError) {
        return {
          status: "unready" as const,
          mode: input.rollout.mode,
          lifecycle,
          errorCode: executionError
        };
      }
    }
    return {
      status: "ready" as const,
      mode: input.rollout.mode,
      lifecycle,
      errorCode: null
    };
  };

  return {
    runInitial,
    runExecutionOnce,
    runRecoveryOnce,
    start: () => {
      if (lifecycle !== "idle" || !accepting) return;
      lifecycle = "running";
      if (claimingEnabled) {
        scheduleExecution(input.pollIntervalMs);
      }
      scheduleRecovery(input.recoveryIntervalMs);
    },
    stop: async () => {
      if (lifecycle === "stopped") return;
      lifecycle = "stopping";
      accepting = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (recoveryTimer) clearTimeout(recoveryTimer);
      pollTimer = undefined;
      recoveryTimer = undefined;
      const operations = [executionInFlight, recoveryInFlight].filter(
        (operation): operation is Promise<FlowExecutionRunSummary | FlowRecoveryRunSummary> =>
          operation !== null
      );
      try {
        await drainWithinDeadline(operations, input.drainTimeoutMs);
      } catch {
        input.logger.error("flow execution drain failed", {
          errorCode: "flow_execution_drain_deadline_exceeded"
        });
        throw new Error(FLOW_EXECUTION_DRAIN_DEADLINE_EXCEEDED);
      }
      lifecycle = "stopped";
    },
    getState: () => ({ lifecycle, mode: input.rollout.mode }),
    getOperationalReadiness
  };
}

async function drainExecutionBatch(
  processNext: () => Promise<FlowExecutionTickResult>,
  batchSize: number,
  isAccepting: () => boolean
): Promise<FlowExecutionRunSummary> {
  let processedCount = 0;
  for (let index = 0; index < batchSize && isAccepting(); index += 1) {
    const result = await processNext();
    if (result.status === "idle") break;
    processedCount += 1;
  }
  return processedCount === 0
    ? { status: "idle", processedCount: 0 }
    : { status: "processed", processedCount };
}

function observeDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(createTimeoutError()), timeoutMs);
    timeout.unref();
    operation.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function drainWithinDeadline(
  operations: readonly Promise<unknown>[],
  timeoutMs: number
): Promise<void> {
  if (operations.length === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(FLOW_EXECUTION_DRAIN_DEADLINE_EXCEEDED)),
      timeoutMs
    );
    Promise.allSettled(operations).then(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function normalizeCanaryOwnerScope(input: unknown): FlowExecutionCanaryOwnerScope {
  if (!input || typeof input !== "object") {
    throw new Error("FLOW_EXECUTION_CANARY_SCOPE_INVALID");
  }
  const candidate = input as { readonly kind?: unknown; readonly ownerUserIds?: unknown };
  if (
    candidate.kind !== "allowlist" ||
    !Array.isArray(candidate.ownerUserIds) ||
    candidate.ownerUserIds.length < 1 ||
    candidate.ownerUserIds.length > 100 ||
    candidate.ownerUserIds.some(
      (ownerUserId) =>
        typeof ownerUserId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          ownerUserId
        )
    )
  ) {
    throw new Error("FLOW_EXECUTION_CANARY_SCOPE_INVALID");
  }
  const ownerUserIds = candidate.ownerUserIds.map((ownerUserId) => ownerUserId.toLowerCase());
  if (new Set(ownerUserIds).size !== ownerUserIds.length) {
    throw new Error("FLOW_EXECUTION_CANARY_SCOPE_INVALID");
  }
  return { kind: "allowlist", ownerUserIds: [...ownerUserIds].sort() };
}

function nextScheduleDelay(
  intervalMs: number,
  consecutiveFailures: number,
  maximumMs: number,
  jitter: number
): number {
  if (consecutiveFailures === 0) return intervalMs;
  const exponent = Math.min(consecutiveFailures, 20);
  const capped = Math.min(maximumMs, intervalMs * 2 ** exponent);
  const minimum = capped * (1 - jitter);
  return Math.max(intervalMs, Math.floor(minimum + Math.random() * (capped - minimum)));
}

function laneReadinessError(input: {
  readonly now: number;
  readonly intervalMs: number;
  readonly operationTimeoutMs: number;
  readonly lastSucceededAt: number | null;
  readonly lastFailedAt: number | null;
  readonly lastErrorCode: string | null;
  readonly prefix: "flow_execution_poll" | "flow_execution_recovery";
}): string | null {
  if (input.lastSucceededAt === null) return `${input.prefix}_not_initialized`;
  if (input.lastFailedAt !== null && input.lastFailedAt >= input.lastSucceededAt) {
    return input.lastErrorCode ?? `${input.prefix}_failed`;
  }
  const ageMs = input.now - input.lastSucceededAt;
  const staleAfterMs = Math.max(
    input.intervalMs * 3,
    input.operationTimeoutMs + input.intervalMs * 2
  );
  if (ageMs < 0 || ageMs > staleAfterMs) return `${input.prefix}_stale`;
  return null;
}
