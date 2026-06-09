import { describe, expect, it } from "vitest";
import { HealthService } from "./health.service";

describe("ops-api health service", () => {
  it("returns a contract-valid health response", () => {
    const service = new HealthService();
    const response = service.getHealth(new Date("2026-06-09T00:00:00.000Z"));

    expect(response).toEqual({
      service: "ops-api",
      status: "ok",
      timestamp: "2026-06-09T00:00:00.000Z"
    });
  });
});
