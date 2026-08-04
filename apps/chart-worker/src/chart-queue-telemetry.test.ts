import type { Logger } from "@elevenhouse/observability";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChartQueueTelemetry } from "./chart-queue-telemetry";

afterEach(() => {
  vi.useRealTimers();
});

describe("createChartQueueTelemetry", () => {
  it("collects bounded queue depths and oldest ages without reading or logging job payloads", async () => {
    const sensitive = "PRIVATE_BIRTH_AND_HORARY_PAYLOAD";
    const queue = {
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 3, active: 2, delayed: 1, failed: 4 }),
      getJobs: vi
        .fn()
        .mockResolvedValueOnce([{ timestamp: 9_000, data: sensitive }])
        .mockResolvedValueOnce([{ timestamp: 8_000, data: sensitive }])
    };
    const logger = createLogger();
    const telemetry = createChartQueueTelemetry({
      queue,
      intervalMs: 30_000,
      operationTimeoutMs: 1_000,
      now: () => 10_000,
      logger
    });

    await telemetry.runOnce();

    expect(queue.getJobCounts).toHaveBeenCalledWith("waiting", "active", "delayed", "failed");
    expect(queue.getJobs).toHaveBeenNthCalledWith(1, ["waiting"], 0, 0, true);
    expect(queue.getJobs).toHaveBeenNthCalledWith(2, ["delayed"], 0, 0, true);
    expect(logger.info).toHaveBeenCalledWith("chart calculation queue telemetry", {
      activeDepth: 2,
      delayedDepth: 1,
      failedDepth: 4,
      oldestDelayedAgeMs: 2_000,
      oldestWaitingAgeMs: 1_000,
      waitingDepth: 3
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(sensitive);
  });

  it("reports a fixed safe code instead of a queue or Redis diagnostic", async () => {
    const sensitive = "redis://user:secret@redis/private chart input_snapshot";
    const logger = createLogger();
    const telemetry = createChartQueueTelemetry({
      queue: {
        getJobCounts: vi.fn().mockRejectedValue(new Error(sensitive)),
        getJobs: vi.fn().mockRejectedValue(new Error(sensitive))
      },
      intervalMs: 30_000,
      operationTimeoutMs: 1_000,
      logger
    });

    await expect(telemetry.runOnce()).rejects.toThrow(sensitive);

    expect(logger.error).toHaveBeenCalledWith("chart calculation queue telemetry failed", {
      errorCode: "chart_queue_telemetry_failed"
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(sensitive);
  });

  it("fails closed instead of masking a future queue timestamp as zero age", async () => {
    const logger = createLogger();
    const telemetry = createChartQueueTelemetry({
      queue: {
        getJobCounts: vi.fn().mockResolvedValue({ waiting: 1, active: 0, delayed: 0, failed: 0 }),
        getJobs: vi
          .fn()
          .mockResolvedValueOnce([{ timestamp: 10_001 }])
          .mockResolvedValueOnce([])
      },
      intervalMs: 30_000,
      operationTimeoutMs: 1_000,
      now: () => 10_000,
      logger
    });

    await expect(telemetry.runOnce()).rejects.toThrow("CHART_QUEUE_TELEMETRY_TIMESTAMP_INVALID");
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith("chart calculation queue telemetry failed", {
      errorCode: "chart_queue_telemetry_failed"
    });
  });

  it("does not overlap a timed-out collection and waits for it during shutdown", async () => {
    vi.useFakeTimers();
    const pending = deferred<Record<string, number>>();
    const queue = {
      getJobCounts: vi.fn(() => pending.promise),
      getJobs: vi.fn().mockResolvedValue([])
    };
    const logger = createLogger();
    const telemetry = createChartQueueTelemetry({
      queue,
      intervalMs: 1_000,
      operationTimeoutMs: 100,
      logger
    });
    const running = telemetry.runOnce().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);
    await expect(running).resolves.toMatchObject({
      message: "CHART_QUEUE_TELEMETRY_DEADLINE_EXCEEDED"
    });
    expect(logger.error).toHaveBeenCalledWith("chart calculation queue telemetry failed", {
      errorCode: "chart_queue_telemetry_deadline_exceeded"
    });
    telemetry.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queue.getJobCounts).toHaveBeenCalledOnce();

    let stopped = false;
    const stopping = telemetry.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    pending.resolve({ waiting: 0, active: 0, delayed: 0, failed: 0 });
    await stopping;
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(queue.getJobCounts).toHaveBeenCalledOnce();
  });

  it("rejects non-positive collection intervals", () => {
    expect(() =>
      createChartQueueTelemetry({
        queue: { getJobCounts: vi.fn(), getJobs: vi.fn() },
        intervalMs: 0,
        operationTimeoutMs: 100,
        logger: createLogger()
      })
    ).toThrow("CHART_QUEUE_TELEMETRY_INTERVAL_INVALID");
  });
});

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as Logger & {
    readonly info: ReturnType<typeof vi.fn>;
    readonly error: ReturnType<typeof vi.fn>;
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
