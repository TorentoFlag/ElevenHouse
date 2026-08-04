import { describe, expect, it } from "vitest";
import {
  parseChartCalculationParticipants,
  parseChartDatabaseTimestamp,
  parseChartInterpretationMode
} from "./chart-calculation-job-row";

describe("chart calculation job row parsing", () => {
  it("normalizes PostgreSQL timestamp strings and rejects invalid values", () => {
    expect(
      parseChartDatabaseTimestamp(
        "2026-08-03 12:34:56.789+00",
        "CHART_DATABASE_CLOCK_INVALID"
      ).toISOString()
    ).toBe("2026-08-03T12:34:56.789Z");
    expect(() =>
      parseChartDatabaseTimestamp("not-a-timestamp", "CHART_DATABASE_CLOCK_INVALID")
    ).toThrow("CHART_DATABASE_CLOCK_INVALID");
    expect(() => parseChartDatabaseTimestamp(null, "CHART_DATABASE_CLOCK_INVALID")).toThrow(
      "CHART_DATABASE_CLOCK_INVALID"
    );
  });

  it("rejects non-canonical participant UUIDs at the strict row boundary", () => {
    expect(() =>
      parseChartCalculationParticipants(
        [{ role: "subject", clientId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
        "natal",
        "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
      )
    ).toThrow("CHART_JOB_PARTICIPANTS_INVALID");
  });

  it("reads legacy NULL mode as unclassified without age inference", () => {
    expect(parseChartInterpretationMode(null)).toBe("legacy_unclassified");
    expect(parseChartInterpretationMode("adult_natal")).toBe("adult_natal");
    expect(parseChartInterpretationMode("child")).toBe("child");
    expect(() => parseChartInterpretationMode("adult")).toThrow(
      "CHART_JOB_INTERPRETATION_MODE_INVALID"
    );
  });
});
