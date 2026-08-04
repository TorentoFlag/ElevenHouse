import type { Server } from "node:http";
import { performance } from "node:perf_hooks";
import type { ChartJobProcessingStore } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

type Closable = { readonly close: () => Promise<unknown> };
type ReadyCheck = { readonly waitUntilReady: () => Promise<unknown> };
type PeriodicOperation = {
  readonly runOnce: () => Promise<unknown>;
  readonly start: () => void;
  readonly stop: () => Promise<unknown>;
};

type RecoveryObservation = { terminal: boolean; readonly startedAt: number };

export function createChartJobRecovery(input: {
  readonly store: Pick<ChartJobProcessingStore, "recoverExpired" | "recoverPendingDeliveries">;
  readonly limit: number;
  readonly intervalMs: number;
  readonly operationTimeoutMs: number;
  readonly logger: Pick<Logger, "info" | "error">;
}): PeriodicOperation {
  let accepting = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | null = null;
  let inFlightObservation: RecoveryObservation | null = null;

  const runOnce = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (inFlight) {
      if (inFlightObservation === null) {
        input.logger.error("chart calculation recovery failed", {
          errorCode: "chart_recovery_state_invalid"
        });
        return Promise.reject(new Error("CHART_RECOVERY_STATE_INVALID"));
      }
      return withObservedRecoveryDeadline(inFlight as Promise<void>, inFlightObservation);
    }
    const observation: RecoveryObservation = { terminal: false, startedAt: performance.now() };
    const operation = recover(observation);
    inFlight = operation;
    inFlightObservation = observation;
    void operation.then(
      () => {
        if (inFlight === operation) {
          inFlight = null;
          inFlightObservation = null;
        }
      },
      () => {
        if (inFlight === operation) {
          inFlight = null;
          inFlightObservation = null;
        }
      }
    );
    return withObservedRecoveryDeadline(operation, observation);
  };

  const withObservedRecoveryDeadline = async (
    operation: Promise<void>,
    observation: RecoveryObservation
  ): Promise<void> => {
    try {
      await withOperationDeadline(
        () => operation,
        input.operationTimeoutMs,
        "CHART_RECOVERY_OPERATION_DEADLINE_EXCEEDED"
      );
    } catch (error) {
      if (
        isErrorCode(error, "CHART_RECOVERY_OPERATION_DEADLINE_EXCEEDED") &&
        markRecoveryTerminal(observation)
      ) {
        input.logger.error("chart calculation recovery failed", {
          durationMs: elapsedMs(observation.startedAt),
          errorCode: "chart_recovery_deadline_exceeded"
        });
      }
      throw error;
    }
  };

  async function recover(observation: RecoveryObservation): Promise<void> {
    try {
      const [expired, pending] = await Promise.all([
        input.store.recoverExpired({ limit: input.limit }),
        input.store.recoverPendingDeliveries({ limit: input.limit })
      ]);
      if (markRecoveryTerminal(observation)) {
        input.logger.info("chart calculation recovery completed", {
          durationMs: elapsedMs(observation.startedAt),
          requeuedCount: expired.requeuedJobIds.length,
          failedCount: expired.failedJobIds.length,
          rearmedCount: pending.rearmedJobIds.length
        });
      }
    } catch (error) {
      if (markRecoveryTerminal(observation)) {
        input.logger.error("chart calculation recovery failed", {
          durationMs: elapsedMs(observation.startedAt),
          errorCode: "chart_recovery_failed"
        });
      }
      throw error;
    }
  }

  return {
    runOnce,
    start: () => {
      if (timer || !accepting) return;
      timer = setInterval(() => {
        runOnce().catch(() => undefined);
      }, input.intervalMs);
      timer.unref();
    },
    stop: async () => {
      accepting = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      await inFlight;
    }
  };
}

function elapsedMs(startedAt: number): number {
  return performance.now() - startedAt;
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

function markRecoveryTerminal(observation: RecoveryObservation): boolean {
  if (observation.terminal) return false;
  observation.terminal = true;
  return true;
}

export function createChartWorkerRuntime(input: {
  readonly readinessServer: Pick<Server, "listen" | "once" | "off" | "close" | "listening">;
  readonly readinessPort: number;
  readonly readinessHost: string;
  readonly operationTimeoutMs: number;
  readonly relay: PeriodicOperation;
  readonly recovery: PeriodicOperation;
  readonly telemetry: PeriodicOperation;
  readonly abortInFlight: () => void;
  readonly setAcceptingWork: (accepting: boolean) => void;
  readonly onFatalWorkerStop?: () => void;
  readonly queue: Closable & ReadyCheck;
  readonly worker: Closable &
    ReadyCheck & {
      readonly on: unknown;
      readonly off: unknown;
      readonly pause: (doNotWaitActive?: boolean) => Promise<void>;
      readonly run: () => Promise<void>;
    };
  readonly postgres: Closable & {
    readonly pool: { readonly query: (sql: string) => Promise<unknown> };
  };
  readonly chartEngine: { readonly checkReady: () => Promise<unknown> };
  readonly logger: Pick<Logger, "info" | "error" | "warn">;
}) {
  let shutdownPromise: Promise<void> | null = null;
  let readinessClosePromise: Promise<void> | null = null;
  let lifecycle: "idle" | "starting" | "running" | "stopping" | "stopped" = "idle";

  async function startup(): Promise<void> {
    if (lifecycle !== "idle") throw new Error("CHART_WORKER_STARTUP_STATE_INVALID");
    lifecycle = "starting";
    input.setAcceptingWork(false);
    await Promise.all([
      withOperationDeadline(
        () => input.postgres.pool.query("select 1"),
        input.operationTimeoutMs,
        "CHART_WORKER_POSTGRES_STARTUP_DEADLINE_EXCEEDED"
      ),
      withOperationDeadline(
        () => input.queue.waitUntilReady(),
        input.operationTimeoutMs,
        "CHART_WORKER_QUEUE_STARTUP_DEADLINE_EXCEEDED"
      ),
      withOperationDeadline(
        () => input.worker.waitUntilReady(),
        input.operationTimeoutMs,
        "CHART_WORKER_INTAKE_STARTUP_DEADLINE_EXCEEDED"
      ),
      withOperationDeadline(
        () => input.chartEngine.checkReady(),
        input.operationTimeoutMs,
        "CHART_WORKER_ENGINE_STARTUP_DEADLINE_EXCEEDED"
      )
    ]);
    if (lifecycle !== "starting") return;
    await Promise.all([input.relay.runOnce(), input.recovery.runOnce(), input.telemetry.runOnce()]);
    if (lifecycle !== "starting") return;
    const workerRun = input.worker.run();
    void workerRun.then(handleUnexpectedWorkerStop, handleUnexpectedWorkerStop);
    await new Promise<void>((resolve, reject) => {
      input.readinessServer.once("error", reject);
      input.readinessServer.listen(input.readinessPort, input.readinessHost, () => {
        input.readinessServer.off("error", reject);
        resolve();
      });
    });
    if (lifecycle !== "starting") {
      await closeReadinessServer();
      return;
    }
    lifecycle = "running";
    input.setAcceptingWork(true);
    input.relay.start();
    input.recovery.start();
    input.telemetry.start();
    input.logger.info("chart worker ready", {
      host: input.readinessHost,
      port: input.readinessPort
    });

    function handleUnexpectedWorkerStop(): void {
      if (lifecycle !== "starting" && lifecycle !== "running") return;
      input.setAcceptingWork(false);
      input.logger.error("chart calculation queue worker stopped unexpectedly", {
        errorCode: "chart_queue_worker_stopped"
      });
      void shutdown()
        .catch(() => undefined)
        .finally(() => input.onFatalWorkerStop?.());
    }
  }

  function shutdown(): Promise<void> {
    shutdownPromise ??= shutdownOnce();
    return shutdownPromise;
  }

  async function shutdownOnce(): Promise<void> {
    lifecycle = "stopping";
    input.setAcceptingWork(false);
    let incomplete = false;
    const settle = async (operation: () => Promise<unknown>): Promise<boolean> => {
      try {
        await withOperationDeadline(
          operation,
          input.operationTimeoutMs,
          "CHART_WORKER_SHUTDOWN_OPERATION_DEADLINE_EXCEEDED"
        );
        return true;
      } catch {
        incomplete = true;
        return false;
      }
    };
    const [, relayStopped, recoveryStopped, telemetryStopped] = await Promise.all([
      settle(() => input.worker.pause(true)),
      settle(() => input.relay.stop()),
      settle(() => input.recovery.stop()),
      settle(() => input.telemetry.stop())
    ]);
    input.abortInFlight();
    await settle(closeReadinessServer);
    const workerStopped = await settle(() => input.worker.close());
    if (relayStopped && recoveryStopped && telemetryStopped && workerStopped) {
      await settle(() => input.queue.close());
      await settle(() => input.postgres.close());
    } else {
      incomplete = true;
    }
    lifecycle = "stopped";
    if (incomplete) throw new Error("CHART_WORKER_SHUTDOWN_INCOMPLETE");
  }

  return { startup, shutdown };

  function closeReadinessServer(): Promise<void> {
    if (!input.readinessServer.listening) return Promise.resolve();
    readinessClosePromise ??= new Promise<void>((resolve, reject) =>
      input.readinessServer.close((error?: Error) => (error ? reject(error) : resolve()))
    );
    return readinessClosePromise;
  }
}

async function withOperationDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  deadlineCode: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(deadlineCode)), timeoutMs);
        timer.unref();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
