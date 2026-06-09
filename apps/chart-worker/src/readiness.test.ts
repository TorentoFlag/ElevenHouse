import { describe, expect, it } from "vitest";
import { createWorkerReadiness } from "./readiness";

describe("chart-worker readiness", () => {
  it("returns a deterministic readiness payload", () => {
    expect(createWorkerReadiness("chart-worker", new Date("2026-06-09T00:00:00.000Z"))).toEqual({
      service: "chart-worker",
      status: "ready",
      timestamp: "2026-06-09T00:00:00.000Z"
    });
  });
});
