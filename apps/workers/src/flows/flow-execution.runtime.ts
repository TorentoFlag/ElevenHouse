import type { FlowApprovalWakeSweepResult, FlowWorkItemWakeSweepResult } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

type FlowExecutionDeploymentCeiling =
  | { readonly mode: "definition_only" }
  | { readonly mode: "canary" }
  | { readonly mode: "enabled" };

type FlowExecutionTickResult = { readonly status: string };
type FlowExecutionRunSummary =
  | { readonly status: "disabled"; readonly processedCount: 0 }
  | { readonly status: "idle"; readonly processedCount: 0 }
  | { readonly status: "processed"; readonly processedCount: number };
type FlowRecoveryRunSummary = { readonly status: "disabled" } | FlowExecutionTickResult;
type FlowWorkItemWakeRunSummary = { readonly status: "disabled" } | FlowWorkItemWakeSweepResult;
type FlowApprovalWakeRunSummary = { readonly status: "disabled" } | FlowApprovalWakeSweepResult;
type FlowExecutionLifecycle = "idle" | "running" | "stopping" | "stopped";

const FLOW_EXECUTION_POLL_DEADLINE_EXCEEDED = "FLOW_EXECUTION_POLL_DEADLINE_EXCEEDED";
const FLOW_EXECUTION_RECOVERY_DEADLINE_EXCEEDED = "FLOW_EXECUTION_RECOVERY_DEADLINE_EXCEEDED";
const FLOW_WORK_ITEM_WAKE_DEADLINE_EXCEEDED = "FLOW_WORK_ITEM_WAKE_DEADLINE_EXCEEDED";
const FLOW_APPROVAL_WAKE_DEADLINE_EXCEEDED = "FLOW_APPROVAL_WAKE_DEADLINE_EXCEEDED";
const FLOW_EXECUTION_DRAIN_DEADLINE_EXCEEDED = "FLOW_EXECUTION_DRAIN_DEADLINE_EXCEEDED";

export function createFlowExecutionRuntime(input: {
  readonly deploymentCeiling: FlowExecutionDeploymentCeiling;
  readonly pollIntervalMs: number;
  readonly pollBatchSize: number;
  readonly recoveryIntervalMs: number;
  readonly workItemWakeIntervalMs: number;
  readonly approvalWakeIntervalMs: number;
  readonly operationTimeoutMs: number;
  readonly drainTimeoutMs: number;
  readonly errorBackoffMaxMs: number;
  readonly errorJitter: number;
  readonly processNext: () => Promise<FlowExecutionTickResult>;
  readonly recoverExpired: () => Promise<FlowExecutionTickResult>;
  readonly wakeDueWorkItems: () => Promise<FlowWorkItemWakeSweepResult>;
  readonly wakeDueApprovals: () => Promise<FlowApprovalWakeSweepResult>;
  readonly logger: Pick<Logger, "info" | "warn" | "error">;
}) {
  if (
    input.deploymentCeiling.mode !== "definition_only" &&
    input.deploymentCeiling.mode !== "canary" &&
    input.deploymentCeiling.mode !== "enabled"
  ) {
    throw new Error("FLOW_EXECUTION_DEPLOYMENT_CEILING_INVALID");
  }
  let accepting = true;
  let lifecycle: FlowExecutionLifecycle = "idle";
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let workItemWakeTimer: ReturnType<typeof setTimeout> | undefined;
  let approvalWakeTimer: ReturnType<typeof setTimeout> | undefined;
  let executionInFlight: Promise<FlowExecutionRunSummary> | null = null;
  let recoveryInFlight: Promise<FlowRecoveryRunSummary> | null = null;
  let workItemWakeInFlight: Promise<FlowWorkItemWakeSweepResult> | null = null;
  let approvalWakeInFlight: Promise<FlowApprovalWakeSweepResult> | null = null;
  let executionDeadlineLogged = false;
  let recoveryDeadlineLogged = false;
  let workItemWakeDeadlineLogged = false;
  let approvalWakeDeadlineLogged = false;
  let executionLastSucceededAt: number | null = null;
  let recoveryLastSucceededAt: number | null = null;
  let workItemWakeLastSucceededAt: number | null = null;
  let approvalWakeLastSucceededAt: number | null = null;
  let executionLastFailedAt: number | null = null;
  let recoveryLastFailedAt: number | null = null;
  let workItemWakeLastFailedAt: number | null = null;
  let approvalWakeLastFailedAt: number | null = null;
  let executionLastErrorCode: string | null = null;
  let recoveryLastErrorCode: string | null = null;
  let workItemWakeLastErrorCode: string | null = null;
  let approvalWakeLastErrorCode: string | null = null;
  let executionScheduleFailures = 0;
  let recoveryScheduleFailures = 0;
  let workItemWakeScheduleFailures = 0;
  let approvalWakeScheduleFailures = 0;

  const claimingEnabled = input.deploymentCeiling.mode !== "definition_only";

  const startExecutionOperation = (): Promise<FlowExecutionRunSummary> => {
    const operation = drainExecutionBatch(input.processNext, input.pollBatchSize, () => accepting);
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

  const startWorkItemWakeOperation = (): Promise<FlowWorkItemWakeSweepResult> => {
    const operation = input.wakeDueWorkItems();
    workItemWakeDeadlineLogged = false;
    const tracked = operation.then(
      (result) => {
        if (workItemWakeInFlight === tracked) workItemWakeInFlight = null;
        const completedAt = Date.now();
        workItemWakeLastSucceededAt = completedAt;
        if (result.integrityFailureCount > 0) {
          workItemWakeLastFailedAt = completedAt;
          workItemWakeLastErrorCode = "flow_work_item_wake_integrity_failure";
        } else {
          workItemWakeLastFailedAt = null;
          workItemWakeLastErrorCode = null;
        }
        return result;
      },
      (error: unknown) => {
        if (workItemWakeInFlight === tracked) workItemWakeInFlight = null;
        workItemWakeLastFailedAt = Date.now();
        workItemWakeLastErrorCode = "flow_work_item_wake_failed";
        input.logger.error("flow work item wake failed", {
          errorCode: "flow_work_item_wake_failed"
        });
        throw error;
      }
    );
    workItemWakeInFlight = tracked;
    void tracked.catch(() => undefined);
    return tracked;
  };

  const runWorkItemWakeOnce = (): Promise<FlowWorkItemWakeRunSummary> => {
    if (!accepting) return Promise.resolve({ status: "disabled" });
    const operation = workItemWakeInFlight ?? startWorkItemWakeOperation();
    return observeDeadline(operation, input.operationTimeoutMs, () => {
      if (!workItemWakeDeadlineLogged) {
        workItemWakeDeadlineLogged = true;
        workItemWakeLastFailedAt = Date.now();
        workItemWakeLastErrorCode = "flow_work_item_wake_deadline_exceeded";
        input.logger.error("flow work item wake failed", {
          errorCode: "flow_work_item_wake_deadline_exceeded"
        });
      }
      return new Error(FLOW_WORK_ITEM_WAKE_DEADLINE_EXCEEDED);
    });
  };

  const startApprovalWakeOperation = (): Promise<FlowApprovalWakeSweepResult> => {
    const operation = input.wakeDueApprovals();
    approvalWakeDeadlineLogged = false;
    const tracked = operation.then(
      (result) => {
        if (approvalWakeInFlight === tracked) approvalWakeInFlight = null;
        const completedAt = Date.now();
        approvalWakeLastSucceededAt = completedAt;
        if (result.integrityFailureCount > 0) {
          approvalWakeLastFailedAt = completedAt;
          approvalWakeLastErrorCode = "flow_approval_wake_integrity_failure";
        } else {
          approvalWakeLastFailedAt = null;
          approvalWakeLastErrorCode = null;
        }
        return result;
      },
      (error: unknown) => {
        if (approvalWakeInFlight === tracked) approvalWakeInFlight = null;
        approvalWakeLastFailedAt = Date.now();
        approvalWakeLastErrorCode = "flow_approval_wake_failed";
        input.logger.error("flow approval wake failed", {
          errorCode: "flow_approval_wake_failed"
        });
        throw error;
      }
    );
    approvalWakeInFlight = tracked;
    void tracked.catch(() => undefined);
    return tracked;
  };

  const runApprovalWakeOnce = (): Promise<FlowApprovalWakeRunSummary> => {
    if (!accepting) return Promise.resolve({ status: "disabled" });
    const operation = approvalWakeInFlight ?? startApprovalWakeOperation();
    return observeDeadline(operation, input.operationTimeoutMs, () => {
      if (!approvalWakeDeadlineLogged) {
        approvalWakeDeadlineLogged = true;
        approvalWakeLastFailedAt = Date.now();
        approvalWakeLastErrorCode = "flow_approval_wake_deadline_exceeded";
        input.logger.error("flow approval wake failed", {
          errorCode: "flow_approval_wake_deadline_exceeded"
        });
      }
      return new Error(FLOW_APPROVAL_WAKE_DEADLINE_EXCEEDED);
    });
  };

  const runInitial = async () => {
    if (!accepting) return { status: "disabled" } as const;
    const recovery = await runRecoveryOnce();
    const workItemWake = await runWorkItemWakeOnce();
    const approvalWake = await runApprovalWakeOnce();
    const execution = await runExecutionOnce();
    return { status: "completed", recovery, workItemWake, approvalWake, execution } as const;
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

  const scheduleWorkItemWake = (delayMs: number): void => {
    workItemWakeTimer = setTimeout(async () => {
      workItemWakeTimer = undefined;
      try {
        await runWorkItemWakeOnce();
        workItemWakeScheduleFailures = 0;
      } catch {
        workItemWakeScheduleFailures += 1;
      }
      if (accepting && lifecycle === "running") {
        scheduleWorkItemWake(
          nextScheduleDelay(
            input.workItemWakeIntervalMs,
            workItemWakeScheduleFailures,
            input.errorBackoffMaxMs,
            input.errorJitter
          )
        );
      }
    }, delayMs);
    workItemWakeTimer.unref();
  };

  const scheduleApprovalWake = (delayMs: number): void => {
    approvalWakeTimer = setTimeout(async () => {
      approvalWakeTimer = undefined;
      try {
        await runApprovalWakeOnce();
        approvalWakeScheduleFailures = 0;
      } catch {
        approvalWakeScheduleFailures += 1;
      }
      if (accepting && lifecycle === "running") {
        scheduleApprovalWake(
          nextScheduleDelay(
            input.approvalWakeIntervalMs,
            approvalWakeScheduleFailures,
            input.errorBackoffMaxMs,
            input.errorJitter
          )
        );
      }
    }, delayMs);
    approvalWakeTimer.unref();
  };

  const getOperationalReadiness = () => {
    if (lifecycle !== "running") {
      return {
        status: "unready" as const,
        mode: input.deploymentCeiling.mode,
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
        mode: input.deploymentCeiling.mode,
        lifecycle,
        errorCode: recoveryError
      };
    }
    const workItemWakeError = laneReadinessError({
      now,
      intervalMs: input.workItemWakeIntervalMs,
      operationTimeoutMs: input.operationTimeoutMs,
      lastSucceededAt: workItemWakeLastSucceededAt,
      lastFailedAt: workItemWakeLastFailedAt,
      lastErrorCode: workItemWakeLastErrorCode,
      prefix: "flow_work_item_wake"
    });
    if (workItemWakeError) {
      return {
        status: "unready" as const,
        mode: input.deploymentCeiling.mode,
        lifecycle,
        errorCode: workItemWakeError
      };
    }
    const approvalWakeError = laneReadinessError({
      now,
      intervalMs: input.approvalWakeIntervalMs,
      operationTimeoutMs: input.operationTimeoutMs,
      lastSucceededAt: approvalWakeLastSucceededAt,
      lastFailedAt: approvalWakeLastFailedAt,
      lastErrorCode: approvalWakeLastErrorCode,
      prefix: "flow_approval_wake"
    });
    if (approvalWakeError) {
      return {
        status: "unready" as const,
        mode: input.deploymentCeiling.mode,
        lifecycle,
        errorCode: approvalWakeError
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
          mode: input.deploymentCeiling.mode,
          lifecycle,
          errorCode: executionError
        };
      }
    }
    return {
      status: "ready" as const,
      mode: input.deploymentCeiling.mode,
      lifecycle,
      errorCode: null
    };
  };

  return {
    runInitial,
    runExecutionOnce,
    runRecoveryOnce,
    runWorkItemWakeOnce,
    runApprovalWakeOnce,
    start: () => {
      if (lifecycle !== "idle" || !accepting) return;
      lifecycle = "running";
      if (claimingEnabled) {
        scheduleExecution(input.pollIntervalMs);
      }
      scheduleRecovery(input.recoveryIntervalMs);
      scheduleWorkItemWake(input.workItemWakeIntervalMs);
      scheduleApprovalWake(input.approvalWakeIntervalMs);
    },
    stop: async () => {
      if (lifecycle === "stopped") return;
      lifecycle = "stopping";
      accepting = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (workItemWakeTimer) clearTimeout(workItemWakeTimer);
      if (approvalWakeTimer) clearTimeout(approvalWakeTimer);
      pollTimer = undefined;
      recoveryTimer = undefined;
      workItemWakeTimer = undefined;
      approvalWakeTimer = undefined;
      const operations: Promise<unknown>[] = [];
      if (executionInFlight) operations.push(executionInFlight);
      if (recoveryInFlight) operations.push(recoveryInFlight);
      if (workItemWakeInFlight) operations.push(workItemWakeInFlight);
      if (approvalWakeInFlight) operations.push(approvalWakeInFlight);
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
    getState: () => ({ lifecycle, mode: input.deploymentCeiling.mode }),
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
  readonly prefix:
    | "flow_execution_poll"
    | "flow_execution_recovery"
    | "flow_work_item_wake"
    | "flow_approval_wake";
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
