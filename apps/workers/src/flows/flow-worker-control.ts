import {
  FlowRuntimeControlIntegrityError,
  FlowWorkerReadinessLeaseLostError,
  FlowWorkerRuntimeModeCeilingError,
  createFlowWorkerRegistration,
  type FlowWorkerReadinessAuthority,
  type FlowWorkerReadinessStore,
  type FlowWorkerRegistration
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

type FlowWorkerControlLifecycle =
  | "idle"
  | "registered"
  | "running"
  | "draining"
  | "stopped"
  | "failed";

export class FlowWorkerReadinessHeartbeatExpiredError extends Error {
  override readonly name = "FlowWorkerReadinessHeartbeatExpiredError";
  readonly code = "FLOW_WORKER_READINESS_HEARTBEAT_EXPIRED";

  constructor() {
    super("Flow worker readiness heartbeat expired before authority was renewed");
  }
}

export function createFlowWorkerControl(input: {
  readonly store: FlowWorkerReadinessStore;
  readonly registration: FlowWorkerRegistration;
  readonly heartbeatIntervalMaxMs: number;
  readonly logger: Pick<Logger, "info" | "warn" | "error">;
  readonly onFatal: (error: Error) => void;
}) {
  if (
    !Number.isInteger(input.heartbeatIntervalMaxMs) ||
    input.heartbeatIntervalMaxMs < 250 ||
    input.heartbeatIntervalMaxMs > 20_000
  ) {
    throw new FlowRuntimeControlIntegrityError();
  }
  const registration = createFlowWorkerRegistration(input.registration);
  const identity = {
    instanceId: registration.instanceId,
    sessionId: registration.sessionId
  } as const;
  let lifecycle: FlowWorkerControlLifecycle = "idle";
  let authority: FlowWorkerReadinessAuthority | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatInFlight: Promise<FlowWorkerReadinessAuthority> | null = null;
  let drainPromise: Promise<void> | null = null;
  let lastErrorCode: string | null = null;
  let fatalSignaled = false;

  const clearHeartbeatTimer = (): void => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = undefined;
  };

  const signalFatal = (error: Error): void => {
    if (fatalSignaled || lifecycle === "draining" || lifecycle === "stopped") return;
    fatalSignaled = true;
    lifecycle = "failed";
    clearHeartbeatTimer();
    lastErrorCode = errorCode(error);
    input.logger.error("flow worker readiness failed", { errorCode: lastErrorCode });
    input.onFatal(error);
  };

  const scheduleHeartbeat = (delayMs: number): void => {
    if (lifecycle !== "running") return;
    clearHeartbeatTimer();
    heartbeatTimer = setTimeout(() => {
      heartbeatTimer = undefined;
      void runHeartbeatOnce().catch(() => undefined);
    }, delayMs);
    heartbeatTimer.unref();
  };

  const runHeartbeatOnce = (): Promise<FlowWorkerReadinessAuthority> => {
    if (heartbeatInFlight) return heartbeatInFlight;
    if (lifecycle !== "running") {
      return Promise.reject(new FlowWorkerReadinessLeaseLostError());
    }

    let nextDelayMs: number | null = null;
    const operation = input.store
      .heartbeat(identity)
      .then((nextAuthority) => {
        assertOwnedReadyAuthority(nextAuthority, registration);
        authority = nextAuthority;
        lastErrorCode = null;
        nextDelayMs = heartbeatDelay(nextAuthority, input.heartbeatIntervalMaxMs);
        return nextAuthority;
      })
      .catch((error: unknown) => {
        const normalized = normalizeError(error);
        lastErrorCode = errorCode(normalized);
        if (isTerminalHeartbeatError(normalized) || readinessHasExpired(authority)) {
          signalFatal(
            isTerminalHeartbeatError(normalized)
              ? normalized
              : new FlowWorkerReadinessHeartbeatExpiredError()
          );
        } else {
          input.logger.warn("flow worker readiness heartbeat failed", {
            errorCode: "flow_worker_readiness_heartbeat_failed"
          });
          lastErrorCode = "flow_worker_readiness_heartbeat_failed";
          nextDelayMs = heartbeatRetryDelay(authority);
        }
        throw normalized;
      })
      .finally(() => {
        if (heartbeatInFlight === operation) heartbeatInFlight = null;
        if (lifecycle === "running" && nextDelayMs !== null) {
          scheduleHeartbeat(nextDelayMs);
        }
      });
    heartbeatInFlight = operation;
    return operation;
  };

  const register = async (): Promise<FlowWorkerReadinessAuthority> => {
    if (lifecycle !== "idle") throw new FlowRuntimeControlIntegrityError();
    const nextAuthority = await input.store.register(registration);
    assertOwnedReadyAuthority(nextAuthority, registration);
    authority = nextAuthority;
    lastErrorCode = null;
    lifecycle = "registered";
    return nextAuthority;
  };

  const beginDrain = (): Promise<void> => {
    if (drainPromise) return drainPromise;
    if (lifecycle === "idle" || lifecycle === "stopped") return Promise.resolve();
    lifecycle = "draining";
    lastErrorCode = "flow_worker_readiness_draining";
    clearHeartbeatTimer();
    drainPromise = (async () => {
      await heartbeatInFlight?.catch(() => undefined);
      const drained = await input.store.beginDrain(identity);
      assertOwnedDrainingAuthority(drained, registration);
      authority = drained;
    })();
    return drainPromise;
  };

  const stop = async (): Promise<void> => {
    clearHeartbeatTimer();
    await heartbeatInFlight?.catch(() => undefined);
    lifecycle = "stopped";
    lastErrorCode = "flow_worker_readiness_stopped";
  };

  const isClaimingAllowed = (): boolean =>
    lifecycle === "running" &&
    lastErrorCode === null &&
    authority?.state === "ready" &&
    Date.parse(authority.readyUntil) > Date.now();

  const getOperationalReadiness = () => {
    if (isClaimingAllowed()) {
      return {
        status: "ready" as const,
        lifecycle,
        policyRevision: authority?.policyRevision ?? null,
        errorCode: null
      };
    }
    return {
      status: "unready" as const,
      lifecycle,
      policyRevision: authority?.policyRevision ?? null,
      errorCode: lastErrorCode ?? "flow_worker_readiness_not_running"
    };
  };

  return {
    register,
    start: () => {
      if (lifecycle !== "registered" || !authority) {
        throw new FlowRuntimeControlIntegrityError();
      }
      lifecycle = "running";
      scheduleHeartbeat(heartbeatDelay(authority, input.heartbeatIntervalMaxMs));
    },
    runHeartbeatOnce,
    beginDrain,
    stop,
    isClaimingAllowed,
    getOperationalReadiness,
    getState: () => ({ lifecycle, authority })
  };
}

function assertOwnedReadyAuthority(
  authority: FlowWorkerReadinessAuthority,
  registration: FlowWorkerRegistration
): void {
  if (
    authority.instanceId !== registration.instanceId ||
    authority.sessionId !== registration.sessionId ||
    authority.state !== "ready"
  ) {
    throw new FlowRuntimeControlIntegrityError();
  }
}

function assertOwnedDrainingAuthority(
  authority: FlowWorkerReadinessAuthority,
  registration: FlowWorkerRegistration
): void {
  if (
    authority.instanceId !== registration.instanceId ||
    authority.sessionId !== registration.sessionId ||
    authority.state !== "draining"
  ) {
    throw new FlowRuntimeControlIntegrityError();
  }
}

function heartbeatDelay(
  authority: FlowWorkerReadinessAuthority,
  maximumMs: number
): number {
  const leaseTtlMs = Date.parse(authority.readyUntil) - Date.parse(authority.heartbeatAt);
  if (!Number.isFinite(leaseTtlMs) || leaseTtlMs <= 0) {
    throw new FlowRuntimeControlIntegrityError();
  }
  return Math.max(250, Math.min(maximumMs, Math.floor(leaseTtlMs / 3)));
}

function heartbeatRetryDelay(authority: FlowWorkerReadinessAuthority | null): number {
  if (!authority) return 250;
  const remainingMs = Date.parse(authority.readyUntil) - Date.now();
  return Math.max(100, Math.min(1_000, Math.floor(remainingMs / 2)));
}

function readinessHasExpired(authority: FlowWorkerReadinessAuthority | null): boolean {
  return !authority || Date.parse(authority.readyUntil) <= Date.now();
}

function isTerminalHeartbeatError(error: Error): boolean {
  return (
    error instanceof FlowWorkerReadinessLeaseLostError ||
    error instanceof FlowWorkerRuntimeModeCeilingError ||
    error instanceof FlowRuntimeControlIntegrityError
  );
}

function errorCode(error: Error): string {
  if (error instanceof FlowWorkerReadinessLeaseLostError) {
    return "flow_worker_readiness_lease_lost";
  }
  if (error instanceof FlowWorkerRuntimeModeCeilingError) {
    return "flow_worker_runtime_mode_ceiling_exceeded";
  }
  if (error instanceof FlowRuntimeControlIntegrityError) {
    return "flow_runtime_control_integrity_error";
  }
  if (error instanceof FlowWorkerReadinessHeartbeatExpiredError) {
    return "flow_worker_readiness_heartbeat_expired";
  }
  return "flow_worker_readiness_heartbeat_failed";
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new FlowRuntimeControlIntegrityError();
}
