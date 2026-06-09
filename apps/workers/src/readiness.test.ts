import { describe, expect, it } from "vitest";
import { createWorkerReadiness } from "./readiness";

describe("workers readiness", () => {
  it("returns a deterministic readiness payload", () => {
    expect(createWorkerReadiness("workers", new Date("2026-06-09T00:00:00.000Z"))).toEqual({
      service: "workers",
      status: "ready",
      timestamp: "2026-06-09T00:00:00.000Z"
    });
  });
});
