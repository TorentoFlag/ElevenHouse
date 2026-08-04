import { describe, expect, it, vi } from "vitest";
import type { Logger } from "@elevenhouse/observability";
import { DelayedError } from "bullmq";
import {
  astroCalendarGenerationJobName,
  buildAstroCalendarGenerationBullMqJobId,
  buildChartCalculationBullMqJobId,
  chartCalculationJobName,
  chartCalculationQueueName,
  deferChartCalculationDelivery,
  isFinalConfiguredQueueAttempt,
  observeChartCalculationWorker,
  toAstroCalendarGenerationJobOptions,
  toChartCalculationJobOptions,
  toChartCalculationWorkerOptions
} from "./chart-jobs.queue";

describe("chart jobs queue contract", () => {
  it("uses identifiers only", () => {
    const jobId = "00000000-0000-4000-8000-000000000001";

    expect(chartCalculationQueueName).toBe("chart.calculation");
    expect(chartCalculationJobName).toBe("calculate-natal-chart");
    expect(astroCalendarGenerationJobName).toBe("generate-astro-calendar");
    expect(buildChartCalculationBullMqJobId(jobId, 0)).toBe(
      "chart-calculation-00000000-0000-4000-8000-000000000001-delivery-0"
    );
    expect(buildAstroCalendarGenerationBullMqJobId(jobId)).toBe(
      "astro-calendar-generation-00000000-0000-4000-8000-000000000001"
    );
  });

  it("keeps provider payload out of queue options", () => {
    expect(
      toChartCalculationJobOptions({
        jobId: "00000000-0000-4000-8000-000000000001",
        durableAttempts: 0,
        maxAttempts: 3,
        backoffMs: 1000,
        jitter: 0.5
      })
    ).toMatchObject({
      jobId: "chart-calculation-00000000-0000-4000-8000-000000000001-delivery-0",
      attempts: 1
    });
  });

  it("uses stable options for astro calendar generation jobs", () => {
    expect(
      toAstroCalendarGenerationJobOptions({
        generationId: "00000000-0000-4000-8000-000000000002",
        attempts: 5,
        backoffMs: 2000,
        jitter: 0.25
      })
    ).toMatchObject({
      jobId: "astro-calendar-generation-00000000-0000-4000-8000-000000000002",
      attempts: 5
    });
  });

  it("fails closed when an AstroCalendar queue delivery has no explicit attempt policy", () => {
    expect(isFinalConfiguredQueueAttempt({ attempts: 5, attemptsMade: 4 })).toBe(true);
    expect(isFinalConfiguredQueueAttempt({ attempts: 5, attemptsMade: 3 })).toBe(false);
    expect(() => isFinalConfiguredQueueAttempt({ attempts: undefined, attemptsMade: 0 })).toThrow(
      "Queue attempts must be explicitly configured"
    );
  });

  it("keeps the Bull worker lock beyond the durable PostgreSQL lease", () => {
    expect(
      toChartCalculationWorkerOptions("redis://localhost:6379/2", {
        concurrency: 3,
        durableLeaseMs: 60_000
      })
    ).toMatchObject({
      connection: { host: "localhost", port: 6379, db: 2 },
      concurrency: 3,
      lockDuration: 120_000,
      autorun: false
    });
  });

  it("moves a chart delivery to delayed without consuming a Bull attempt", async () => {
    const moveToDelayed = vi.fn().mockResolvedValue(undefined);

    await expect(
      deferChartCalculationDelivery(
        { moveToDelayed, token: "worker-lock-token" },
        { delayMs: 5_000, nowMs: 10_000 }
      )
    ).rejects.toBeInstanceOf(DelayedError);

    expect(moveToDelayed).toHaveBeenCalledWith(15_000, "worker-lock-token");
  });

  it("fails the transport delivery safely when Redis did not move it to delayed", async () => {
    const sensitive = "select * from chart_jobs params=[birthSnapshot,resultData]";

    await expect(
      deferChartCalculationDelivery(
        {
          moveToDelayed: vi.fn().mockRejectedValue(new Error(sensitive)),
          token: "worker-lock-token"
        },
        { delayMs: 5_000, nowMs: 10_000 }
      )
    ).rejects.toMatchObject({ name: "Error", message: "CHART_QUEUE_DEFER_FAILED" });
  });

  it("redacts raw failed and worker errors before logging", () => {
    const handlers = new Map<string, (...args: never[]) => void>();
    const worker = {
      on: vi.fn((event: string, handler: (...args: never[]) => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn()
    };
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as unknown as Logger;
    observeChartCalculationWorker(worker as never, logger);
    const sensitive = "DrizzleQueryError SQL params birthDate resultData";

    handlers.get("failed")?.(
      { id: "queue-id", name: chartCalculationJobName, attemptsMade: 0 } as never,
      new Error(sensitive) as never
    );
    handlers.get("error")?.(new Error(sensitive) as never);

    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(sensitive);
    expect(logger.error).toHaveBeenNthCalledWith(1, "chart calculation queue job failed", {
      queueJobId: "queue-id",
      jobName: chartCalculationJobName,
      attemptsMade: 0,
      errorCode: "chart_queue_job_failed"
    });
    expect(logger.error).toHaveBeenNthCalledWith(2, "chart calculation queue worker error", {
      errorCode: "chart_queue_transport_failure"
    });
  });
});
