import { describe, expect, it } from "vitest";
import { createTestClock } from "./index";

describe("createTestClock", () => {
  it("returns a stable date for deterministic tests", () => {
    const clock = createTestClock("2026-06-09T00:00:00.000Z");

    expect(clock.now().toISOString()).toBe("2026-06-09T00:00:00.000Z");
  });
});
