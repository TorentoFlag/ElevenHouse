import { describe, expect, it, vi } from "vitest";

import { wakeDueFlowApprovals } from "./flow-approval-wake";

describe("wakeDueFlowApprovals", () => {
  it("delegates a bounded sweep and preserves its durable result", async () => {
    const result = {
      asOf: "2026-08-06T20:00:00.000Z",
      wokenCount: 1,
      expiredCount: 2,
      staleCount: 0,
      integrityFailureCount: 0,
      hasMore: false
    } as const;
    const wakeDue = vi.fn(async () => result);
    await expect(wakeDueFlowApprovals({ store: { wakeDue }, limit: 25 })).resolves.toBe(result);
    expect(wakeDue).toHaveBeenCalledWith({ limit: 25 });
  });

  it("rejects an unsafe unbounded sweep before database access", async () => {
    const wakeDue = vi.fn();
    await expect(wakeDueFlowApprovals({ store: { wakeDue }, limit: 0 })).rejects.toThrow(TypeError);
    expect(wakeDue).not.toHaveBeenCalled();
  });
});
