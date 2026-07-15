import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  calculationPdfDeleteJobName,
  calculationPdfQueueName,
  calculationPdfRenderJobName,
  observeCalculationPdfWorker,
  toCalculationPdfJobOptions
} from "./calculation-pdf.queue";

describe("calculation PDF queue", () => {
  it("uses one generic queue and stable render/delete job names", () => {
    expect(calculationPdfQueueName).toBe("calculation.pdf");
    expect(calculationPdfRenderJobName).toBe("render-calculation-pdf");
    expect(calculationPdfDeleteJobName).toBe("delete-calculation-pdf");
  });

  it("observes worker lifecycle without logging Redis payloads", () => {
    const worker = new EventEmitter();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const stop = observeCalculationPdfWorker(worker as never, logger as never);
    const job = {
      id: "calculation-pdf-render-id",
      name: calculationPdfRenderJobName,
      attemptsMade: 2,
      data: { jobId: "secret-not-for-logs" }
    };

    worker.emit("completed", job);
    worker.emit("failed", job, new Error("render failed"));
    worker.emit("stalled", job.id, "active");
    worker.emit("error", new Error("redis unavailable"));

    const logs = JSON.stringify([
      logger.info.mock.calls,
      logger.warn.mock.calls,
      logger.error.mock.calls
    ]);
    expect(logs).toContain(calculationPdfRenderJobName);
    expect(logs).toContain("render failed");
    expect(logs).toContain("redis unavailable");
    expect(logs).not.toContain("secret-not-for-logs");
    stop();
    expect(worker.listenerCount("completed")).toBe(0);
  });

  it("builds safe retry options for render jobs", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(
      toCalculationPdfJobOptions({
        jobName: calculationPdfRenderJobName,
        data: { jobId: id },
        attempts: 5,
        backoffMs: 1000,
        jitter: 0.5
      })
    ).toEqual({
      jobId: `calculation-pdf-render-${id}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 1000, jitter: 0.5 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 1000 }
    });
  });

  it("builds safe retry options for delete jobs", () => {
    const id = "00000000-0000-4000-8000-000000000002";
    expect(
      toCalculationPdfJobOptions({
        jobName: calculationPdfDeleteJobName,
        data: { mediaAssetId: id },
        attempts: 5,
        backoffMs: 1000,
        jitter: 0.5
      })
    ).toEqual({
      jobId: `calculation-pdf-delete-${id}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 1000, jitter: 0.5 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 1000 }
    });
  });
});
