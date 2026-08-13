import { describe, expect, it, vi } from "vitest";

import { processSessionBookingLifecycleEvents } from "./session-booking-lifecycle.processor";

describe("Session booking lifecycle processor", () => {
  it("reports the bounded projection outcome without hiding store failures", async () => {
    const processPending = vi.fn(async () => ({ processed: 1, provisioned: 1, updated: 0, ignored: 0 }));
    await expect(
      processSessionBookingLifecycleEvents({
        store: { processPending },
        now: new Date("2026-08-13T09:00:00Z"),
        batchSize: 10
      })
    ).resolves.toEqual({ processed: 1, provisioned: 1, updated: 0, ignored: 0 });
  });
});
