import { describe, expect, it } from "vitest";
import { toMatrixPdfJobOptions } from "./matrix-pdf.queue";

describe("toMatrixPdfJobOptions", () => {
  it("uses a deterministic BullMQ-safe id and bounded retention", () => {
    expect(
      toMatrixPdfJobOptions({
        jobId: "00000000-0000-4000-8000-000000000001",
        attempts: 5,
        backoffMs: 1000
      })
    ).toEqual({
      jobId: "matrix-pdf-00000000-0000-4000-8000-000000000001",
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 1000 }
    });
  });
});
