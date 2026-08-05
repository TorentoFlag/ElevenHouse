import { describe, expect, it, vi } from "vitest";
import { shutdownWorkerRuntime } from "./worker-shutdown";

describe("shutdownWorkerRuntime", () => {
  it("drains claims before loops and closes postgres last", async () => {
    const calls: string[] = [];
    const operation = (name: string) =>
      vi.fn(async () => {
        calls.push(name);
      });

    await shutdownWorkerRuntime({
      beginDrain: operation("begin-drain"),
      stopConcurrent: [operation("stop-runtime"), operation("stop-control")],
      closeHealthServer: operation("close-health"),
      stopWorkerObservation: operation("stop-observation"),
      closeCalculationWorker: operation("close-worker"),
      closeQueue: operation("close-queue"),
      closePostgres: operation("close-postgres")
    });

    expect(calls[0]).toBe("begin-drain");
    expect(calls.indexOf("close-health")).toBeGreaterThan(calls.indexOf("stop-runtime"));
    expect(calls.indexOf("close-health")).toBeGreaterThan(calls.indexOf("stop-control"));
    expect(calls.at(-1)).toBe("close-postgres");
  });

  it("settles every operation and reports all failures after postgres closes", async () => {
    const calls: string[] = [];
    const failing = (name: string) =>
      vi.fn(async () => {
        calls.push(name);
        throw new Error(name);
      });
    const succeeding = (name: string) =>
      vi.fn(async () => {
        calls.push(name);
      });

    const result = shutdownWorkerRuntime({
      beginDrain: failing("begin-drain"),
      stopConcurrent: [failing("stop-runtime"), succeeding("stop-control")],
      closeHealthServer: failing("close-health"),
      stopWorkerObservation: succeeding("stop-observation"),
      closeCalculationWorker: failing("close-worker"),
      closeQueue: succeeding("close-queue"),
      closePostgres: failing("close-postgres")
    });

    await expect(result).rejects.toMatchObject({
      name: "AggregateError",
      errors: expect.arrayContaining([
        expect.objectContaining({ message: "begin-drain" }),
        expect.objectContaining({ message: "stop-runtime" }),
        expect.objectContaining({ message: "close-health" }),
        expect.objectContaining({ message: "close-worker" }),
        expect.objectContaining({ message: "close-postgres" })
      ])
    });
    expect(calls).toContain("stop-control");
    expect(calls).toContain("stop-observation");
    expect(calls).toContain("close-queue");
    expect(calls.at(-1)).toBe("close-postgres");
  });
});
