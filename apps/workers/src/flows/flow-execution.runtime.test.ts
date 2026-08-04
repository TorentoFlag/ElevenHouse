import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFlowExecutionRuntime } from "./flow-execution.runtime";

describe("createFlowExecutionRuntime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps claims inert but globally recovers expired leases in definition-only mode", async () => {
    const processNext = vi.fn();
    const recoverExpired = vi.fn(async () => ({ status: "idle" }));
    const runtime = createRuntime({
      rollout: { mode: "definition_only" },
      processNext,
      recoverExpired
    });

    await expect(runtime.runInitial()).resolves.toEqual({
      status: "completed",
      execution: { status: "disabled", processedCount: 0 },
      recovery: { status: "idle" }
    });
    runtime.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await runtime.stop();

    expect(processNext).not.toHaveBeenCalled();
    expect(recoverExpired).toHaveBeenCalledTimes(13);
    expect(runtime.getState()).toEqual({ lifecycle: "stopped", mode: "definition_only" });
  });

  it("drains only a bounded claim batch and stops immediately on idle", async () => {
    const processNext = vi
      .fn()
      .mockResolvedValueOnce({ status: "applied" })
      .mockResolvedValueOnce({ status: "stale" })
      .mockResolvedValueOnce({ status: "idle" });
    const runtime = createRuntime({ processNext, pollBatchSize: 10 });

    await expect(runtime.runExecutionOnce()).resolves.toEqual({
      status: "processed",
      processedCount: 2
    });
    expect(processNext).toHaveBeenCalledTimes(3);
    expect(processNext).toHaveBeenNthCalledWith(1, {
      kind: "allowlist",
      ownerUserIds: ["00000000-0000-4000-8000-000000000001"]
    });

    const alwaysApplied = vi.fn(async () => ({ status: "applied" }));
    const bounded = createRuntime({ processNext: alwaysApplied, pollBatchSize: 3 });
    await expect(bounded.runExecutionOnce()).resolves.toEqual({
      status: "processed",
      processedCount: 3
    });
    expect(alwaysApplied).toHaveBeenCalledTimes(3);
  });

  it("deduplicates overlapping ticks and drains the real in-flight operation on stop", async () => {
    const pending = deferred<{ status: "idle" }>();
    const processNext = vi.fn(() => pending.promise);
    const runtime = createRuntime({ processNext });

    const first = runtime.runExecutionOnce();
    const second = runtime.runExecutionOnce();
    expect(processNext).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = runtime.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    pending.resolve({ status: "idle" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "idle", processedCount: 0 },
      { status: "idle", processedCount: 0 }
    ]);
    await stopping;
    expect(stopped).toBe(true);
  });

  it("runs polling and recovery on independent intervals without overlap", async () => {
    const processNext = vi.fn(async () => ({ status: "idle" }));
    const recoverExpired = vi.fn(async () => ({ status: "idle" }));
    const runtime = createRuntime({
      processNext,
      recoverExpired,
      pollIntervalMs: 1_000,
      recoveryIntervalMs: 5_000
    });

    runtime.start();
    await vi.advanceTimersByTimeAsync(5_000);
    await runtime.stop();

    expect(processNext).toHaveBeenCalledTimes(5);
    expect(recoverExpired).toHaveBeenCalledTimes(1);
  });

  it("backs off failed claim cycles and resets to the poll interval after success", async () => {
    const processNext = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValueOnce(new Error("second failure"))
      .mockResolvedValue({ status: "idle" });
    const runtime = createRuntime({
      processNext,
      pollIntervalMs: 1_000,
      errorBackoffMaxMs: 8_000,
      errorJitter: 0
    });

    runtime.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(processNext).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(processNext).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(processNext).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(processNext).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(processNext).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(999);
    expect(processNext).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(processNext).toHaveBeenCalledTimes(4);
    await runtime.stop();
  });

  it("reports operational readiness only after initial recovery and while running", async () => {
    const runtime = createRuntime({ rollout: { mode: "definition_only" } });

    expect(runtime.getOperationalReadiness()).toEqual({
      status: "unready",
      mode: "definition_only",
      lifecycle: "idle",
      errorCode: "flow_execution_runtime_not_running"
    });
    await runtime.runInitial();
    runtime.start();
    expect(runtime.getOperationalReadiness()).toEqual({
      status: "ready",
      mode: "definition_only",
      lifecycle: "running",
      errorCode: null
    });
    await runtime.stop();
    expect(runtime.getOperationalReadiness()).toMatchObject({
      status: "unready",
      lifecycle: "stopped",
      errorCode: "flow_execution_runtime_not_running"
    });
  });

  it("reports a deadline without starting overlapping work or logging sensitive errors", async () => {
    const pending = deferred<{ status: "idle" }>();
    const processNext = vi.fn(() => pending.promise);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = createRuntime({ processNext, logger, operationTimeoutMs: 1_000 });

    const first = runtime.runExecutionOnce();
    const rejected = expect(first).rejects.toThrow("FLOW_EXECUTION_POLL_DEADLINE_EXCEEDED");
    await vi.advanceTimersByTimeAsync(1_000);
    await rejected;
    const second = runtime.runExecutionOnce();
    expect(processNext).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("flow execution poll failed", {
      errorCode: "flow_execution_poll_deadline_exceeded"
    });

    pending.resolve({ status: "idle" });
    await expect(second).resolves.toEqual({ status: "idle", processedCount: 0 });
    await runtime.stop();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("sensitive");
  });

  it("fails a bounded drain when underlying work ignores the observer deadline", async () => {
    const pending = deferred<{ status: "idle" }>();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = createRuntime({
      processNext: vi.fn(() => pending.promise),
      logger,
      operationTimeoutMs: 1_000,
      drainTimeoutMs: 2_000
    });

    const observed = expect(runtime.runExecutionOnce()).rejects.toThrow(
      "FLOW_EXECUTION_POLL_DEADLINE_EXCEEDED"
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await observed;

    const stopping = expect(runtime.stop()).rejects.toThrow(
      "FLOW_EXECUTION_DRAIN_DEADLINE_EXCEEDED"
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await stopping;

    expect(logger.error).toHaveBeenCalledWith("flow execution drain failed", {
      errorCode: "flow_execution_drain_deadline_exceeded"
    });
    pending.resolve({ status: "idle" });
    await Promise.resolve();
  });

  it("rejects a forged global owner scope in canary mode", () => {
    expect(() =>
      createRuntime({
        rollout: {
          mode: "canary",
          ownerScope: { kind: "all" }
        } as never
      })
    ).toThrow("FLOW_EXECUTION_CANARY_SCOPE_INVALID");
  });
});

function createRuntime(overrides: Partial<Parameters<typeof createFlowExecutionRuntime>[0]> = {}) {
  return createFlowExecutionRuntime({
    rollout: {
      mode: "canary",
      ownerScope: {
        kind: "allowlist",
        ownerUserIds: ["00000000-0000-4000-8000-000000000001"]
      }
    },
    pollIntervalMs: 1_000,
    pollBatchSize: 10,
    recoveryIntervalMs: 5_000,
    operationTimeoutMs: 10_000,
    drainTimeoutMs: 20_000,
    errorBackoffMaxMs: 30_000,
    errorJitter: 0.5,
    processNext: vi.fn(async () => ({ status: "idle" })),
    recoverExpired: vi.fn(async () => ({ status: "idle" })),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
