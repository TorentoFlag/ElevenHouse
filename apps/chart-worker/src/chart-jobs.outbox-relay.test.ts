import { describe, expect, it, vi } from "vitest";
import {
  ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT,
  CHART_CALCULATION_REQUESTED_EVENT
} from "@elevenhouse/domain";
import {
  createChartCalculationOutboxRelay,
  relayPendingChartCalculationEvents
} from "./chart-jobs.outbox-relay";
import { astroCalendarGenerationJobName, chartCalculationJobName } from "./chart-jobs.queue";

const claimFence = 7n;

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
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(),
      markPublishFailed: vi.fn()
    };
    const queue = { add: vi.fn().mockResolvedValue(queueDelivery("waiting")) };
    const chartJobs = {
      getQueueDispatch: vi.fn().mockResolvedValue({
        jobId: "00000000-0000-4000-8000-000000000001",
        attempts: 0,
        maxAttempts: 7
      })
    };

    await relayPendingChartCalculationEvents({
      store,
      chartJobs,
      queue,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { backoffMs: 1000, jitter: 0.5 },
      astroCalendarAttempts: 5
    });

    expect(queue.add).toHaveBeenCalledWith(
      chartCalculationJobName,
      { jobId: "00000000-0000-4000-8000-000000000001" },
      expect.objectContaining({
        jobId: "chart-calculation-00000000-0000-4000-8000-000000000001-delivery-0",
        attempts: 1
      })
    );
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId: "event-1",
      claimFence,
      publishedAt: now
    });
  });

  it("publishes astro calendar generation events as identifier-only jobs", async () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const generationId = "00000000-0000-4000-8000-000000000002";
    const store = {
      claimPending: vi.fn().mockResolvedValue([
        {
          id: "event-2",
          eventType: ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT,
          aggregateId: generationId,
          payload: { generationId },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(),
      markPublishFailed: vi.fn()
    };
    const queue = { add: vi.fn().mockResolvedValue(queueDelivery("waiting")) };
    const chartJobs = { getQueueDispatch: vi.fn() };

    await relayPendingChartCalculationEvents({
      store,
      chartJobs,
      queue,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { backoffMs: 1000, jitter: 0.5 },
      astroCalendarAttempts: 5
    });

    expect(queue.add).toHaveBeenCalledWith(
      astroCalendarGenerationJobName,
      { generationId },
      expect.objectContaining({
        jobId: "astro-calendar-generation-00000000-0000-4000-8000-000000000002",
        attempts: 5
      })
    );
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId: "event-2",
      claimFence,
      publishedAt: now
    });
  });

  it("consumes a chart event that PostgreSQL says is no longer dispatchable", async () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const jobId = "00000000-0000-4000-8000-000000000001";
    const store = {
      claimPending: vi.fn().mockResolvedValue([
        {
          id: "event-3",
          eventType: CHART_CALCULATION_REQUESTED_EVENT,
          aggregateId: jobId,
          payload: { jobId },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(),
      markPublishFailed: vi.fn()
    };
    const queue = { add: vi.fn().mockResolvedValue(queueDelivery("waiting")) };
    const chartJobs = { getQueueDispatch: vi.fn().mockResolvedValue(null) };

    await relayPendingChartCalculationEvents({
      store,
      chartJobs,
      queue,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { backoffMs: 1000, jitter: 0.5 },
      astroCalendarAttempts: 5
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId: "event-3",
      claimFence,
      publishedAt: now
    });
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });

  it("persists and logs only a safe outbox failure when queue transport exposes sensitive data", async () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const jobId = "00000000-0000-4000-8000-000000000001";
    const sensitive = "DrizzleQueryError select input_data result_data params=[birthSnapshot]";
    const store = {
      claimPending: vi.fn().mockResolvedValue([
        {
          id: "event-4",
          eventType: CHART_CALCULATION_REQUESTED_EVENT,
          aggregateId: jobId,
          payload: { jobId },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(),
      markPublishFailed: vi.fn()
    };
    const queue = { add: vi.fn().mockRejectedValue(new Error(sensitive)) };
    const chartJobs = {
      getQueueDispatch: vi.fn().mockResolvedValue({ jobId, attempts: 0, maxAttempts: 3 })
    };
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await relayPendingChartCalculationEvents({
      store,
      chartJobs,
      queue,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { backoffMs: 1000, jitter: 0.5 },
      astroCalendarAttempts: 5,
      logger
    });

    expect(store.markPublishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-4",
        claimFence,
        errorMessage: "Chart calculation delivery could not be published"
      })
    );
    expect(logger.error).toHaveBeenCalledWith("chart calculation outbox event publish failed", {
      outboxEventId: "event-4",
      attempts: 0,
      errorCode: "chart_outbox_publish_failed"
    });
    expect(store.markPublishFailed.mock.calls.flat(Infinity).join(" ")).not.toContain(sensitive);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(sensitive);
  });

  it("redrives a retained failed transport delivery after PostgreSQL rearms its outbox", async () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const jobId = "00000000-0000-4000-8000-000000000001";
    const delivery = queueDelivery("failed");
    const store = {
      claimPending: vi.fn().mockResolvedValue([
        {
          id: "event-rearmed",
          eventType: CHART_CALCULATION_REQUESTED_EVENT,
          aggregateId: jobId,
          payload: { jobId },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(),
      markPublishFailed: vi.fn()
    };

    await relayPendingChartCalculationEvents({
      store,
      chartJobs: {
        getQueueDispatch: vi.fn().mockResolvedValue({ jobId, attempts: 0, maxAttempts: 3 })
      },
      queue: { add: vi.fn().mockResolvedValue(delivery) },
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { backoffMs: 1_000, jitter: 0.5 },
      astroCalendarAttempts: 5
    });

    expect(delivery.retry).toHaveBeenCalledWith("failed", {
      resetAttemptsMade: true,
      resetAttemptsStarted: true
    });
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId: "event-rearmed",
      claimFence,
      publishedAt: now
    });
  });

  it("propagates a stale publish claim without trying to requeue it", async () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const jobId = "00000000-0000-4000-8000-000000000001";
    const staleClaimError = Object.assign(new Error("Outbox relay claim is stale"), {
      name: "OutboxRelayStaleClaimError",
      code: "OUTBOX_RELAY_STALE_CLAIM" as const,
      operation: "mark_published" as const
    });
    const store = {
      claimPending: vi.fn().mockResolvedValue([
        {
          id: "event-stale",
          eventType: CHART_CALCULATION_REQUESTED_EVENT,
          aggregateId: jobId,
          payload: { jobId },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn().mockRejectedValue(staleClaimError),
      markPublishFailed: vi.fn()
    };

    await expect(
      relayPendingChartCalculationEvents({
        store,
        chartJobs: {
          getQueueDispatch: vi.fn().mockResolvedValue({ jobId, attempts: 0, maxAttempts: 3 })
        },
        queue: { add: vi.fn().mockResolvedValue(queueDelivery("waiting")) },
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        queueOptions: { backoffMs: 1_000, jitter: 0.5 },
        astroCalendarAttempts: 5
      })
    ).rejects.toBe(staleClaimError);
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });
});

describe("createChartCalculationOutboxRelay", () => {
  it("reports a relay deadline without overlapping the still-running operation", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const operation = deferred<void>();
    const relayOnce = vi.fn(() => operation.promise);
    const relay = createChartCalculationOutboxRelay({
      relayOnce,
      intervalMs: 1_000,
      operationTimeoutMs: 100,
      onError
    });
    const running = relay.runOnce().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);

    await expect(running).resolves.toMatchObject({
      message: "CHART_OUTBOX_RELAY_DEADLINE_EXCEEDED"
    });
    relay.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(relayOnce).toHaveBeenCalledOnce();

    let stopped = false;
    const stopping = relay.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    operation.resolve(undefined);
    await stopping;
  });
});

function queueDelivery(state: "waiting" | "failed") {
  return {
    getState: vi.fn().mockResolvedValue(state),
    retry: vi.fn().mockResolvedValue(undefined)
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
