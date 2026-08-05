import { describe, expect, it, vi } from "vitest";

import { createProviderOperationDispatchProcessor } from "./provider-operation-dispatch-processor";

describe("provider operation dispatch processor", () => {
  it("owns only interval orchestration and delegates the fenced relay one time per tick", async () => {
    const claimPending = vi.fn(async () => []);
    const processor = createProviderOperationDispatchProcessor({
      store: { claimPending, markPublished: vi.fn(), markPublishFailed: vi.fn() },
      reader: { readDispatchWorkItem: vi.fn() },
      dispatcher: { dispatch: vi.fn() },
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      batchSize: 25,
      publishingLockTimeoutMs: 60_000
    });

    await expect(processor.tick()).resolves.toEqual({ claimed: 0, dispatched: 0, requeued: 0 });
    expect(claimPending).toHaveBeenCalledWith({
      eventTypes: ["finance.provider_operation.dispatch_requested"],
      limit: 25,
      now: new Date("2026-08-04T12:00:00.000Z"),
      stalePublishingBefore: new Date("2026-08-04T11:59:00.000Z")
    });
  });
});
