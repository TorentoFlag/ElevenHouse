import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFlowRuntimeControlMaintenance } from "./flow-runtime-control.maintenance";

describe("createFlowRuntimeControlMaintenance", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs bounded maintenance without overlap, continues after errors and drains in-flight work", async () => {
    const pending = deferred<void>();
    const runOnce = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValueOnce(new Error("temporary database error"))
      .mockResolvedValue(undefined);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const maintenance = createFlowRuntimeControlMaintenance({
      intervalMs: 1_000,
      runOnce,
      logger
    });

    maintenance.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runOnce).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = maintenance.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    pending.resolve();
    await stopping;
    expect(stopped).toBe(true);

    const retrying = createFlowRuntimeControlMaintenance({
      intervalMs: 1_000,
      runOnce,
      logger
    });
    retrying.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(logger.error).toHaveBeenCalledWith("flow runtime control maintenance failed", {
      errorCode: "flow_runtime_control_maintenance_failed"
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runOnce).toHaveBeenCalledTimes(3);
    await retrying.stop();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
