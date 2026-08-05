import type { FlowWorkItemWakeStore, FlowWorkItemWakeSweepResult } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import { describe, expect, it, vi } from "vitest";

import { wakeDueFlowWorkItems } from "./flow-work-item-wake";

describe("wakeDueFlowWorkItems", () => {
  it("runs one bounded wake sweep and returns its exact result", async () => {
    const result = wakeResult();
    const store = createStore(result);

    await expect(wakeDueFlowWorkItems({ store, limit: 25 })).resolves.toBe(result);

    expect(store.wakeDue).toHaveBeenCalledTimes(1);
    expect(store.wakeDue).toHaveBeenCalledWith({ limit: 25 });
  });

  it("emits structured telemetry for a successful sweep", async () => {
    const result = wakeResult();
    const store = createStore(result);
    const logger = createLogger();

    await wakeDueFlowWorkItems({ store, limit: 25, logger });

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("flow work item wake sweep completed", {
      limit: 25,
      asOf: "2026-08-05T09:00:00.000Z",
      wokenCount: 3,
      staleCount: 1,
      integrityFailureCount: 0,
      hasMore: false
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([1, 100])("accepts the inclusive batch limit %s", async (limit) => {
    const result = wakeResult();
    const store = createStore(result);

    await expect(wakeDueFlowWorkItems({ store, limit })).resolves.toBe(result);
    expect(store.wakeDue).toHaveBeenCalledWith({ limit });
  });

  it.each([0, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid batch limit %s before accessing the store",
    async (limit) => {
      const store = createStore(wakeResult());

      await expect(wakeDueFlowWorkItems({ store, limit })).rejects.toThrow(
        "FLOW_WORK_ITEM_WAKE_LIMIT_INVALID"
      );
      expect(store.wakeDue).not.toHaveBeenCalled();
    }
  );

  it("reports integrity failures without discarding successful progress", async () => {
    const result = wakeResult({
      wokenCount: 2,
      staleCount: 4,
      integrityFailureCount: 2,
      hasMore: true
    });
    const store = createStore(result);
    const logger = createLogger();

    await expect(wakeDueFlowWorkItems({ store, limit: 10, logger })).resolves.toBe(result);

    expect(logger.info).toHaveBeenCalledWith("flow work item wake sweep completed", {
      limit: 10,
      asOf: "2026-08-05T09:00:00.000Z",
      wokenCount: 2,
      staleCount: 4,
      integrityFailureCount: 2,
      hasMore: true
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "flow work item wake sweep detected integrity failures",
      {
        errorCode: "flow_work_item_wake_integrity_failures",
        limit: 10,
        asOf: "2026-08-05T09:00:00.000Z",
        wokenCount: 2,
        staleCount: 4,
        integrityFailureCount: 2,
        hasMore: true
      }
    );
  });

  it("logs a store failure and rethrows the exact error", async () => {
    const failure = new Error("database unavailable: do-not-log");
    const store: FlowWorkItemWakeStore = {
      wakeDue: vi.fn(async () => {
        throw failure;
      })
    };
    const logger = createLogger();

    await expect(wakeDueFlowWorkItems({ store, limit: 10, logger })).rejects.toBe(failure);

    expect(store.wakeDue).toHaveBeenCalledTimes(1);
    expect(store.wakeDue).toHaveBeenCalledWith({ limit: 10 });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("flow work item wake sweep failed", {
      errorCode: "flow_work_item_wake_sweep_failed",
      limit: 10
    });
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("do-not-log");
  });
});

function wakeResult(
  overrides: Partial<FlowWorkItemWakeSweepResult> = {}
): FlowWorkItemWakeSweepResult {
  return {
    asOf: "2026-08-05T09:00:00.000Z",
    wokenCount: 3,
    staleCount: 1,
    integrityFailureCount: 0,
    hasMore: false,
    ...overrides
  };
}

function createStore(result: FlowWorkItemWakeSweepResult): FlowWorkItemWakeStore {
  return {
    wakeDue: vi.fn(async () => result)
  };
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}
