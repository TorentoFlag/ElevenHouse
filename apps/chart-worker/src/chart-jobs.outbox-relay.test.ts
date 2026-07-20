import { describe, expect, it, vi } from "vitest";
import { CHART_CALCULATION_REQUESTED_EVENT } from "@elevenhouse/domain";
import { relayPendingChartCalculationEvents } from "./chart-jobs.outbox-relay";
import { chartCalculationJobName } from "./chart-jobs.queue";

describe("relayPendingChartCalculationEvents", () => {
  it("publishes only job id payloads", async () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const store = {
      claimPending: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          eventType: CHART_CALCULATION_REQUESTED_EVENT,
          aggregateId: "00000000-0000-4000-8000-000000000001",
          payload: { jobId: "00000000-0000-4000-8000-000000000001" },
          attempts: 0
        }
      ]),
      markPublished: vi.fn(),
      markPublishFailed: vi.fn()
    };
    const queue = { add: vi.fn() };

    await relayPendingChartCalculationEvents({
      store,
      queue,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { attempts: 3, backoffMs: 1000, jitter: 0.5 }
    });

    expect(queue.add).toHaveBeenCalledWith(
      chartCalculationJobName,
      { jobId: "00000000-0000-4000-8000-000000000001" },
      expect.objectContaining({
        jobId: "chart-calculation-00000000-0000-4000-8000-000000000001"
      })
    );
    expect(store.markPublished).toHaveBeenCalledWith({ eventId: "event-1", publishedAt: now });
  });
});
