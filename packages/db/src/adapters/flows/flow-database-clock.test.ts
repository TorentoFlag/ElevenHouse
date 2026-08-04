import { describe, expect, it } from "vitest";

import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

describe("flow database clock", () => {
  it("rounds a positive PostgreSQL decimal epoch upward to a representable millisecond", () => {
    expect(parseFlowDatabaseEpochMilliseconds("1785786719390.819")?.toISOString()).toBe(
      "2026-08-03T19:51:59.391Z"
    );
    expect(parseFlowDatabaseEpochMilliseconds("1785786719390")?.toISOString()).toBe(
      "2026-08-03T19:51:59.390Z"
    );
  });

  it.each([null, "", "   ", "not-a-decimal", "Infinity", "9007199254740992", "8640000000000001"])(
    "rejects an invalid or unrepresentable database epoch value: %j",
    (value) => {
      expect(parseFlowDatabaseEpochMilliseconds(value)).toBeNull();
    }
  );
});
