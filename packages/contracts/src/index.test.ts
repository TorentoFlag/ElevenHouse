import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./index";

describe("healthResponseSchema", () => {
  it("accepts health responses with ISO timestamps", () => {
    expect(
      healthResponseSchema.parse({
        service: "public-api",
        status: "ok",
        timestamp: "2026-06-09T00:00:00.000Z"
      })
    ).toEqual({
      service: "public-api",
      status: "ok",
      timestamp: "2026-06-09T00:00:00.000Z"
    });
  });
});
