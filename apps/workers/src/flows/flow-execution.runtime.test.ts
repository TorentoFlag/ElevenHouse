import type { FlowApprovalWakeSweepResult, FlowWorkItemWakeSweepResult } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFlowExecutionRuntime } from "./flow-execution.runtime";

describe("createFlowExecutionRuntime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps claims inert but runs recovery, work-item wake, and approval wake in definition-only mode", async () => {
    const processNext = vi.fn();
    const recoverExpired = vi.fn(async () => ({ status: "idle" }));
    const workItemWake = wakeResult();
    const wakeDueWorkItems = vi.fn(async () => workItemWake);
    const approvalWake = approvalWakeResult();
    const wakeDueApprovals = vi.fn(async () => approvalWake);
    const runtime = createRuntime({
      deploymentCeiling: { mode: "definition_only" },
      processNext,
      recoverExpired,
      wakeDueWorkItems,
      wakeDueApprovals
    });

    await expect(runtime.runInitial()).resolves.toEqual({
      status: "completed",
      execution: { status: "disabled", processedCount: 0 },
      recovery: { status: "idle" },
      workItemWake,
      approvalWake
    });
    runtime.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await runtime.stop();

    expect(processNext).not.toHaveBeenCalled();
    expect(recoverExpired).toHaveBeenCalledTimes(13);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(13);
    expect(wakeDueApprovals).toHaveBeenCalledTimes(13);
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
    expect(processNext).toHaveBeenNthCalledWith(1);

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

  it("runs polling, recovery, and work-item wake on independent intervals", async () => {
    const processNext = vi.fn(async () => ({ status: "idle" }));
    const recoverExpired = vi.fn(async () => ({ status: "idle" }));
    const wakeDueWorkItems = vi.fn(async () => wakeResult());
    const runtime = createRuntime({
      processNext,
      recoverExpired,
      wakeDueWorkItems,
      pollIntervalMs: 1_000,
      recoveryIntervalMs: 5_000,
      workItemWakeIntervalMs: 2_000
    });

    runtime.start();
    await vi.advanceTimersByTimeAsync(5_000);
    await runtime.stop();

    expect(processNext).toHaveBeenCalledTimes(5);
    expect(recoverExpired).toHaveBeenCalledTimes(1);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(2);
  });

  it("backs off only failed work-item wake cycles and resets their cadence after success", async () => {
    const processNext = vi.fn(async () => ({ status: "idle" }));
    const wakeDueWorkItems = vi
      .fn<() => Promise<FlowWorkItemWakeSweepResult>>()
      .mockRejectedValueOnce(new Error("first wake failure"))
      .mockRejectedValueOnce(new Error("second wake failure"))
      .mockResolvedValue(wakeResult());
    const runtime = createRuntime({
      processNext,
      wakeDueWorkItems,
      pollIntervalMs: 1_000,
      workItemWakeIntervalMs: 1_000,
      errorBackoffMaxMs: 8_000,
      errorJitter: 0
    });

    runtime.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(1);
    expect(processNext).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(1);
    expect(processNext).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(2);
    expect(processNext).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(3);
    expect(processNext).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(4);
    expect(processNext).toHaveBeenCalledTimes(8);
    await runtime.stop();
  });

  it("deduplicates overlapping work-item wake ticks", async () => {
    const pending = deferred<FlowWorkItemWakeSweepResult>();
    const wakeDueWorkItems = vi.fn(() => pending.promise);
    const runtime = createRuntime({ wakeDueWorkItems });

    const first = runtime.runWorkItemWakeOnce();
    const second = runtime.runWorkItemWakeOnce();

    expect(wakeDueWorkItems).toHaveBeenCalledTimes(1);
    const result = wakeResult({ wokenCount: 1 });
    pending.resolve(result);
    await expect(Promise.all([first, second])).resolves.toEqual([result, result]);
    await runtime.stop();
  });

  it("keeps readiness unready after integrity failures until a clean work-item sweep", async () => {
    const integrityFailure = wakeResult({ integrityFailureCount: 2 });
    const clean = wakeResult({ wokenCount: 0, staleCount: 0 });
    const wakeDueWorkItems = vi
      .fn<() => Promise<FlowWorkItemWakeSweepResult>>()
      .mockResolvedValueOnce(integrityFailure)
      .mockResolvedValue(clean);
    const runtime = createRuntime({
      deploymentCeiling: { mode: "definition_only" },
      wakeDueWorkItems
    });

    await expect(runtime.runInitial()).resolves.toMatchObject({ workItemWake: integrityFailure });
    runtime.start();
    expect(runtime.getOperationalReadiness()).toMatchObject({
      status: "unready",
      errorCode: "flow_work_item_wake_integrity_failure"
    });

    await expect(runtime.runWorkItemWakeOnce()).resolves.toBe(clean);
    expect(runtime.getOperationalReadiness()).toMatchObject({
      status: "ready",
      errorCode: null
    });
    await runtime.stop();
  });

  it("deduplicates approval sweeps and requires a clean sweep after an integrity failure", async () => {
    const pending = deferred<FlowApprovalWakeSweepResult>();
    const clean = approvalWakeResult();
    const wakeDueApprovals = vi
      .fn<() => Promise<FlowApprovalWakeSweepResult>>()
      .mockResolvedValueOnce(approvalWakeResult({ integrityFailureCount: 1 }))
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(clean);
    const runtime = createRuntime({
      deploymentCeiling: { mode: "definition_only" },
      wakeDueApprovals
    });

    await runtime.runInitial();
    runtime.start();
    expect(runtime.getOperationalReadiness()).toMatchObject({
      status: "unready",
      errorCode: "flow_approval_wake_integrity_failure"
    });

    const first = runtime.runApprovalWakeOnce();
    const second = runtime.runApprovalWakeOnce();
    expect(wakeDueApprovals).toHaveBeenCalledTimes(2);
    pending.resolve(clean);
    await expect(Promise.all([first, second])).resolves.toEqual([clean, clean]);
    expect(runtime.getOperationalReadiness()).toMatchObject({ status: "ready", errorCode: null });
    await runtime.stop();
  });

  it("propagates the exact work-item wake rejection and logs only a stable code", async () => {
    const failure = new Error("database unavailable: sensitive details");
    const wakeDueWorkItems = vi
      .fn<() => Promise<FlowWorkItemWakeSweepResult>>()
      .mockResolvedValueOnce(wakeResult())
      .mockRejectedValueOnce(failure);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = createRuntime({
      deploymentCeiling: { mode: "definition_only" },
      wakeDueWorkItems,
      logger
    });

    await runtime.runInitial();
    runtime.start();
    await expect(runtime.runWorkItemWakeOnce()).rejects.toBe(failure);

    expect(runtime.getOperationalReadiness()).toMatchObject({
      status: "unready",
      errorCode: "flow_work_item_wake_failed"
    });
    expect(logger.error).toHaveBeenCalledWith("flow work item wake failed", {
      errorCode: "flow_work_item_wake_failed"
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("sensitive details");
    await runtime.stop();
  });

  it("reports a work-item wake deadline without starting overlapping work", async () => {
    const pending = deferred<FlowWorkItemWakeSweepResult>();
    const wakeDueWorkItems = vi
      .fn<() => Promise<FlowWorkItemWakeSweepResult>>()
      .mockResolvedValueOnce(wakeResult())
      .mockImplementationOnce(() => pending.promise);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = createRuntime({
      deploymentCeiling: { mode: "definition_only" },
      wakeDueWorkItems,
      logger,
      operationTimeoutMs: 1_000
    });

    await runtime.runInitial();
    runtime.start();
    const first = runtime.runWorkItemWakeOnce();
    const rejected = expect(first).rejects.toThrow("FLOW_WORK_ITEM_WAKE_DEADLINE_EXCEEDED");
    await vi.advanceTimersByTimeAsync(1_000);
    await rejected;

    const second = runtime.runWorkItemWakeOnce();
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(2);
    expect(runtime.getOperationalReadiness()).toMatchObject({
      status: "unready",
      errorCode: "flow_work_item_wake_deadline_exceeded"
    });
    expect(logger.error).toHaveBeenCalledWith("flow work item wake failed", {
      errorCode: "flow_work_item_wake_deadline_exceeded"
    });

    const completed = wakeResult({ wokenCount: 1 });
    pending.resolve(completed);
    await expect(second).resolves.toBe(completed);
    await runtime.stop();
  });

  it("clears the wake timer and drains the real in-flight work-item sweep on stop", async () => {
    const pending = deferred<FlowWorkItemWakeSweepResult>();
    const wakeDueWorkItems = vi.fn(() => pending.promise);
    const runtime = createRuntime({
      wakeDueWorkItems,
      workItemWakeIntervalMs: 1_000,
      drainTimeoutMs: 2_000
    });

    const wake = runtime.runWorkItemWakeOnce();
    runtime.start();
    let stopped = false;
    const stopping = runtime.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(stopped).toBe(false);
    expect(wakeDueWorkItems).toHaveBeenCalledTimes(1);
    const result = wakeResult();
    pending.resolve(result);
    await expect(wake).resolves.toBe(result);
    await stopping;
    expect(runtime.getState()).toMatchObject({ lifecycle: "stopped" });
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
    const runtime = createRuntime({ deploymentCeiling: { mode: "definition_only" } });

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
        deploymentCeiling: { mode: "enabled" } as never
      })
    ).toThrow("FLOW_EXECUTION_DEPLOYMENT_CEILING_INVALID");
  });
});

function createRuntime(overrides: Partial<Parameters<typeof createFlowExecutionRuntime>[0]> = {}) {
  return createFlowExecutionRuntime({
    deploymentCeiling: { mode: "canary" },
    pollIntervalMs: 1_000,
    pollBatchSize: 10,
    recoveryIntervalMs: 5_000,
    workItemWakeIntervalMs: 5_000,
    approvalWakeIntervalMs: 5_000,
    operationTimeoutMs: 10_000,
    drainTimeoutMs: 20_000,
    errorBackoffMaxMs: 30_000,
    errorJitter: 0.5,
    processNext: vi.fn(async () => ({ status: "idle" })),
    recoverExpired: vi.fn(async () => ({ status: "idle" })),
    wakeDueWorkItems: vi.fn(async () => wakeResult()),
    wakeDueApprovals: vi.fn(async () => approvalWakeResult()),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides
  });
}

function approvalWakeResult(
  overrides: Partial<FlowApprovalWakeSweepResult> = {}
): FlowApprovalWakeSweepResult {
  return {
    asOf: "2026-08-06T20:00:00.000Z",
    wokenCount: 0,
    expiredCount: 0,
    staleCount: 0,
    integrityFailureCount: 0,
    hasMore: false,
    ...overrides
  };
}

function wakeResult(
  overrides: Partial<FlowWorkItemWakeSweepResult> = {}
): FlowWorkItemWakeSweepResult {
  return {
    asOf: "2026-08-05T09:00:00.000Z",
    wokenCount: 0,
    staleCount: 0,
    integrityFailureCount: 0,
    hasMore: false,
    ...overrides
  };
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
