import { describe, expect, it } from "vitest";
import { inspectChartCivilTime, resolveChartCivilTime } from "./chart-civil-time";

describe("chart civil time", () => {
  it("distinguishes both Berlin fall-back instants", () => {
    expect(
      inspectChartCivilTime({
        date: "2024-10-27",
        time: "02:30",
        timeZone: "Europe/Berlin"
      })
    ).toEqual({
      kind: "ambiguous",
      firstInstant: "2024-10-27T00:30:00Z",
      secondInstant: "2024-10-27T01:30:00Z"
    });
    expect(
      resolveChartCivilTime({
        date: "2024-10-27",
        time: "02:30",
        timeZone: "Europe/Berlin",
        dstOccurrence: "first"
      })
    ).toEqual({ instant: "2024-10-27T00:30:00Z", dstOccurrence: "first" });
    expect(
      resolveChartCivilTime({
        date: "2024-10-27",
        time: "02:30",
        timeZone: "Europe/Berlin",
        dstOccurrence: "second"
      })
    ).toEqual({ instant: "2024-10-27T01:30:00Z", dstOccurrence: "second" });
    expect(() =>
      resolveChartCivilTime({
        date: "2024-10-27",
        time: "02:30",
        timeZone: "Europe/Berlin",
        dstOccurrence: null
      })
    ).toThrow("CHART_BIRTH_TIME_DST_OCCURRENCE_REQUIRED");
  });

  it("rejects a nonexistent spring-forward local time", () => {
    expect(
      inspectChartCivilTime({
        date: "2024-03-31",
        time: "02:30",
        timeZone: "Europe/Berlin"
      })
    ).toEqual({ kind: "nonexistent" });
  });

  it("rejects invalid civil fields and normalizes irrelevant DST selection", () => {
    expect(() =>
      inspectChartCivilTime({ date: "2026-02-31", time: "10:30", timeZone: "Europe/Rome" })
    ).toThrow("CHART_BIRTH_DATE_INVALID");
    expect(() =>
      inspectChartCivilTime({ date: "2026-02-28", time: "24:00", timeZone: "Europe/Rome" })
    ).toThrow("CHART_BIRTH_TIME_INVALID");
    expect(() =>
      inspectChartCivilTime({ date: "2026-02-28", time: "10:30", timeZone: "Not/AZone" })
    ).toThrow("CHART_BIRTH_TIMEZONE_INVALID");
    expect(
      resolveChartCivilTime({
        date: "2026-02-28",
        time: "10:30",
        timeZone: "Europe/Rome",
        dstOccurrence: "second"
      })
    ).toEqual({ instant: "2026-02-28T09:30:00Z", dstOccurrence: null });
  });
});
