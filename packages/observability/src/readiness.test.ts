import { describe, expect, it } from "vitest";
import { createReadinessResponse } from "./readiness";

describe("createReadinessResponse", () => {
  it("returns a stable ready response", () => {
    expect(createReadinessResponse("payment-worker", new Date("2026-07-07T00:00:00.000Z"))).toEqual({
      service: "payment-worker",
      status: "ready",
      timestamp: "2026-07-07T00:00:00.000Z"
    });
  });
});
