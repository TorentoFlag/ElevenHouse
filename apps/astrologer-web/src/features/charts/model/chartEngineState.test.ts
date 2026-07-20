import { describe, expect, it } from "vitest";
import {
  getChartBirthDataReadiness,
  toVisibleChartJobState,
  type BackendChartJobStatus
} from "./chartEngineState";

describe("chartEngineState", () => {
  it.each(["queued", "processing"] satisfies BackendChartJobStatus[])(
    "maps backend %s to one visible calculating state",
    (status) => {
      expect(toVisibleChartJobState(status)).toBe("calculating");
    }
  );

  it("keeps terminal job states visible", () => {
    expect(toVisibleChartJobState("succeeded")).toBe("succeeded");
    expect(toVisibleChartJobState("failed")).toBe("failed");
  });

  it("requires date, known time, timezone and coordinates for natal chart calculation", () => {
    expect(
      getChartBirthDataReadiness({
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        birthTimezone: "Europe/Rome",
        birthLatitude: 41.9028,
        birthLongitude: 12.4964
      })
    ).toEqual({ ready: true });
    expect(
      getChartBirthDataReadiness({
        birthDate: "1990-07-15",
        birthTime: null,
        birthTimePrecision: "unknown",
        birthTimezone: "Europe/Rome",
        birthLatitude: 41.9028,
        birthLongitude: 12.4964
      })
    ).toEqual({
      ready: false,
      missing: ["время рождения"]
    });
  });
});
