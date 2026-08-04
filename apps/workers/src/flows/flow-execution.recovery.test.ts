import type { FlowExecutionStore } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { recoverExpiredFlowExecutions } from "./flow-execution.recovery";

describe("recoverExpiredFlowExecutions", () => {
  it("runs exactly one bounded recovery batch", async () => {
    const store = createStore({
      recoveredCount: 3,
      retryScheduledCount: 2,
      failedTerminalCount: 1,
      quarantinedCount: 0
    });

    await expect(recoverExpiredFlowExecutions({ store, limit: 25 })).resolves.toEqual({
      status: "recovered",
      recoveredCount: 3,
      retryScheduledCount: 2,
      failedTerminalCount: 1,
      quarantinedCount: 0
    });
    expect(store.recoverExpired).toHaveBeenCalledTimes(1);
    expect(store.recoverExpired).toHaveBeenCalledWith({ limit: 25 });
  });

  it("returns idle when no leases expired", async () => {
    const store = createStore({
      recoveredCount: 0,
      retryScheduledCount: 0,
      failedTerminalCount: 0,
      quarantinedCount: 0
    });

    await expect(recoverExpiredFlowExecutions({ store, limit: 100 })).resolves.toEqual({
      status: "idle",
      recoveredCount: 0,
      retryScheduledCount: 0,
      failedTerminalCount: 0,
      quarantinedCount: 0
    });
  });

  it.each([0, 101, 1.5])("rejects an unbounded recovery limit %s before storage", async (limit) => {
    const store = createStore({
      recoveredCount: 0,
      retryScheduledCount: 0,
      failedTerminalCount: 0,
      quarantinedCount: 0
    });

    await expect(recoverExpiredFlowExecutions({ store, limit })).rejects.toThrow(
      "Flow execution recovery limit must be between 1 and 100"
    );
    expect(store.recoverExpired).not.toHaveBeenCalled();
  });
});

function createStore(
  recovery: Awaited<ReturnType<FlowExecutionStore["recoverExpired"]>>
): FlowExecutionStore {
  return {
    claimNext: vi.fn(async () => null),
    finalize: vi.fn(async () => ({ status: "stale" as const })),
    finalizeFailure: vi.fn(async () => ({ status: "stale" as const })),
    recoverExpired: vi.fn(async () => recovery),
    getRunDetail: vi.fn(async () => null)
  };
}
