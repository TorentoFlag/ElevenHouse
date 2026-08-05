import { afterEach, describe, expect, it, vi } from "vitest";

import { startCanonicalClientOrderCaptureInterval } from "./canonical-client-order-capture-interval";

describe("canonical client-order capture interval", () => {
  afterEach(() => vi.useRealTimers());

  it("processes a durable inbox item immediately and again on its configured cadence", async () => {
    vi.useFakeTimers();
    const processOne = vi
      .fn()
      .mockResolvedValueOnce({ kind: "committed", effect: "applied_once", inboxItemId: "inbox-1" })
      .mockResolvedValueOnce({ kind: "idle" });
    const onResult = vi.fn();

    const stop = startCanonicalClientOrderCaptureInterval({
      processor: { processOne },
      intervalMs: 1_000,
      onResult,
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledWith({
      kind: "committed",
      effect: "applied_once",
      inboxItemId: "inbox-1"
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(processOne).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenLastCalledWith({ kind: "idle" });

    stop();
  });
});
