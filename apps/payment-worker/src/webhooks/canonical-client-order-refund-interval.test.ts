import { afterEach, describe, expect, it, vi } from "vitest";

import { startCanonicalClientOrderRefundInterval } from "./canonical-client-order-refund-interval";

describe("canonical client-order refund interval", () => {
  afterEach(() => vi.useRealTimers());

  it("processes a durable refund immediately and reports a blocked payout outcome", async () => {
    vi.useFakeTimers();
    const processOne = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "committed",
        effect: "blocked_payout_outcome",
        inboxItemId: "inbox-1"
      })
      .mockResolvedValueOnce({ kind: "idle" });
    const onResult = vi.fn();
    const stop = startCanonicalClientOrderRefundInterval({
      processor: { processOne },
      intervalMs: 1_000,
      onResult,
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledWith({
      kind: "committed",
      effect: "blocked_payout_outcome",
      inboxItemId: "inbox-1"
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(processOne).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenLastCalledWith({ kind: "idle" });
    stop();
  });
});
