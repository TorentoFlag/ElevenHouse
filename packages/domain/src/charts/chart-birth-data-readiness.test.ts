import { describe, expect, it } from "vitest";
import { assertChartBirthDataReady } from "./chart-birth-data-readiness";

const base = {
  birthDate: "1990-07-15",
  birthTime: "10:30",
  birthTimePrecision: "exact" as const,
  birthTimezone: "Europe/Rome",
  birthLatitude: 41.9028,
  birthLongitude: 12.4964,
  birthTimeDstOccurrence: null
};

describe("assertChartBirthDataReady", () => {
  it("returns normalized ready birth data for exact time", () => {
    expect(assertChartBirthDataReady(base)).toEqual({
      birthDate: "1990-07-15",
      birthTime: "10:30",
      birthTimePrecision: "exact",
      birthTimezone: "Europe/Rome",
      birthLatitude: 41.9028,
      birthLongitude: 12.4964,
      birthTimeDstOccurrence: null
    });
  });

  it("rejects unknown birth time", () => {
    expect(() =>
      assertChartBirthDataReady({
        ...base,
        birthTime: null,
        birthTimePrecision: "unknown"
      })
    ).toThrow("CHART_BIRTH_TIME_REQUIRED");
  });

  it("rejects non-IANA timezone values", () => {
    expect(() => assertChartBirthDataReady({ ...base, birthTimezone: "Rome" })).toThrow(
      "CHART_BIRTH_TIMEZONE_INVALID"
    );
  });
});
