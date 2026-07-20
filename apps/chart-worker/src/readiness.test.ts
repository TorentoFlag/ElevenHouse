import { describe, expect, it } from "vitest";
import { createWorkerReadiness } from "./readiness";

describe("chart-worker readiness", () => {
  it("returns a deterministic readiness payload", async () => {
    await expect(
      createWorkerReadiness({
        service: "chart-worker",
        now: new Date("2026-06-09T00:00:00.000Z"),
        checks: {
          postgres: async () => {},
          chartCalculationQueue: async () => {},
          chartCalculationWorker: async () => {},
          chartEngine: async () => {}
        }
      })
    ).resolves.toEqual({
      service: "chart-worker",
      status: "ready",
      timestamp: "2026-06-09T00:00:00.000Z",
      dependencies: {
        postgres: { status: "ready" },
        chartCalculationQueue: { status: "ready" },
        chartCalculationWorker: { status: "ready" },
        chartEngine: { status: "ready" }
      }
    });
  });
});
