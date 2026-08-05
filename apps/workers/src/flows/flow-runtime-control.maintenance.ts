import type { Logger } from "@elevenhouse/observability";

export function createFlowRuntimeControlMaintenance(input: {
  readonly intervalMs: number;
  readonly runOnce: () => Promise<void>;
  readonly logger: Pick<Logger, "info" | "warn" | "error">;
}) {
  if (!Number.isInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("FLOW_RUNTIME_CONTROL_MAINTENANCE_INTERVAL_INVALID");
  }
  let accepting = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;

  const schedule = (): void => {
    if (!accepting || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void runOnce()
        .catch(() => undefined)
        .finally(() => schedule());
    }, input.intervalMs);
    timer.unref();
  };

  const runOnce = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (inFlight) return inFlight;
    const operation = input
      .runOnce()
      .catch((error: unknown) => {
        input.logger.error("flow runtime control maintenance failed", {
          errorCode: "flow_runtime_control_maintenance_failed"
        });
        throw error;
      })
      .finally(() => {
        if (inFlight === operation) inFlight = null;
      });
    inFlight = operation;
    return operation;
  };

  return {
    runOnce,
    start: () => schedule(),
    stop: async () => {
      accepting = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await inFlight?.catch(() => undefined);
    }
  };
}
