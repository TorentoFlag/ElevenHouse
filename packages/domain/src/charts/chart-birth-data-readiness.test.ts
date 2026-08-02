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

  it("requires an occurrence for a DST fold and preserves zero coordinates", () => {
    expect(() =>
      assertChartBirthDataReady({
        ...base,
        birthDate: "2024-10-27",
        birthTime: "02:30",
        birthTimezone: "Europe/Berlin"
      })
    ).toThrow("CHART_BIRTH_TIME_DST_OCCURRENCE_REQUIRED");
    expect(
      assertChartBirthDataReady({
        ...base,
        birthDate: "2024-10-27",
        birthTime: "02:30",
        birthTimezone: "Europe/Berlin",
        birthTimeDstOccurrence: "second",
        birthLatitude: 0,
        birthLongitude: 0
      })
    ).toMatchObject({
      birthTimeDstOccurrence: "second",
      birthLatitude: 0,
      birthLongitude: 0
    });
  });

  it("normalizes a non-fold occurrence and rejects invalid calendar and time values", () => {
    expect(
      assertChartBirthDataReady({ ...base, birthTimeDstOccurrence: "first" })
    ).toMatchObject({ birthTimeDstOccurrence: null });
    expect(() => assertChartBirthDataReady({ ...base, birthDate: "2026-02-31" })).toThrow(
      "CHART_BIRTH_DATE_INVALID"
    );
    expect(() => assertChartBirthDataReady({ ...base, birthTime: "24:00" })).toThrow(
      "CHART_BIRTH_TIME_INVALID"
    );
  });
});
