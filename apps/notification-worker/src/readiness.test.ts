import { describe, expect, it } from "vitest";
import { createWorkerReadiness } from "./readiness";

describe("notification-worker readiness", () => {
  it("returns a deterministic readiness payload", () => {
    expect(
      createWorkerReadiness("notification-worker", new Date("2026-06-09T00:00:00.000Z"))
    ).toEqual({
      service: "notification-worker",
      status: "ready",
      timestamp: "2026-06-09T00:00:00.000Z"
    });
  });
});
