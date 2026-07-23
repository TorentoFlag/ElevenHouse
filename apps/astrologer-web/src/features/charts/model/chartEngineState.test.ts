import { describe, expect, it } from "vitest";
import type {
  ChartSettings,
  StoredChartCalculationPayload,
  StoredChartNatalCalculationPayload,
  StoredChartProgressionCalculationPayload,
  StoredChartSolarReturnCalculationPayload,
  StoredChartSynastryCalculationPayload
} from "@elevenhouse/contracts";
import {
  getChartBirthDataReadiness,
  isChartResultStale,
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

  it("allows approximate birth time while still requiring an actual time value", () => {
    expect(
      getChartBirthDataReadiness({
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "approximate",
        birthTimezone: "Europe/Rome",
        birthLatitude: 41.9028,
        birthLongitude: 12.4964
      })
    ).toEqual({ ready: true });
  });

  it("keeps a restored calculation current when settings and birth snapshot still match", () => {
    expect(isChartResultStale(chartResult(), readyBirthData(), chartSettings())).toBe(false);
  });

  it("marks a restored calculation stale when current birth data no longer matches the snapshot", () => {
    expect(
      isChartResultStale(
        chartResult(),
        {
          ...readyBirthData(),
          birthTime: "11:45",
          birthTimePrecision: "approximate"
        },
        chartSettings()
      )
    ).toBe(true);
  });

  it("marks a restored calculation stale when current calculation settings differ", () => {
    expect(
      isChartResultStale(chartResult(), readyBirthData(), {
        ...chartSettings(),
        houseSystem: "koch"
      })
    ).toBe(true);
  });

  it("marks a result stale when the visible chart mode differs from the stored method", () => {
    expect(isChartResultStale(chartResult(), readyBirthData(), chartSettings(), "transit")).toBe(
      true
    );
  });

  it("marks a transit result stale when the selected transit moment changed", () => {
    expect(
      isChartResultStale(transitResult(), readyBirthData(), chartSettings(), "transit", {
        date: "2026-07-23",
        time: "14:30"
      })
    ).toBe(true);
  });

  it("marks a synastry result stale when the partner birth data changed", () => {
    expect(
      isChartResultStale(
        synastryResult(),
        readyBirthData(),
        chartSettings(),
        "synastry",
        undefined,
        {
          ...readyBirthData(),
          birthDate: "1992-08-12"
        }
      )
    ).toBe(true);
  });

  it("marks a solar return result stale when the selected year changed", () => {
    expect(
      isChartResultStale(
        solarReturnResult(),
        readyBirthData(),
        chartSettings(),
        "solar_return",
        undefined,
        undefined,
        2027
      )
    ).toBe(true);
  });

  it("marks a progression result stale when the selected target date changed", () => {
    expect(
      isChartResultStale(
        progressionResult(),
        readyBirthData(),
        chartSettings(),
        "progression",
        undefined,
        undefined,
        undefined,
        "2026-07-24"
      )
    ).toBe(true);
  });
});

function chartSettings(): ChartSettings {
  return {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function readyBirthData() {
  return {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact" as const,
    birthTimezone: "Europe/Rome",
    birthLatitude: 41.9028,
    birthLongitude: 12.4964,
    birthTimeDstOccurrence: null
  };
}

function chartResult(
  overrides: Partial<StoredChartNatalCalculationPayload> = {}
): StoredChartNatalCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartSettings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      points: [],
      houses: [],
      aspects: [],
      distributions: {
        elements: { fire: 0, earth: 0, air: 0, water: 0 },
        modalities: { cardinal: 0, fixed: 0, mutable: 0 },
        polarity: { masculine: 0, feminine: 0 }
      },
      warnings: []
    },
    ...overrides
  };
}

function transitResult(): StoredChartCalculationPayload {
  const natal = chartResult().result;

  return {
    schemaVersion: "chart-result.v1",
    method: "transit",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartSettings(),
    inputSnapshot: chartResult().inputSnapshot,
    transitSnapshot: {
      date: "2026-07-22",
      time: "14:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964
    },
    result: {
      natal,
      transit: natal,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function synastryResult(): StoredChartSynastryCalculationPayload {
  const natal = chartResult().result;

  return {
    schemaVersion: "chart-result.v1",
    method: "synastry",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartSettings(),
    inputSnapshot: chartResult().inputSnapshot,
    partnerInputSnapshot: chartResult().inputSnapshot,
    relationshipSnapshot: {
      primaryClientId: "22222222-2222-4222-8222-222222222222",
      partnerClientId: "55555555-5555-4555-8555-555555555555"
    },
    result: {
      primary: natal,
      partner: natal,
      aspectsBetween: [],
      houseOverlays: [],
      warnings: []
    }
  };
}

function solarReturnResult(): StoredChartSolarReturnCalculationPayload {
  const natal = chartResult().result;

  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartSettings(),
    inputSnapshot: chartResult().inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal,
      solarReturn: natal,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function progressionResult(): StoredChartProgressionCalculationPayload {
  const natal = chartResult().result;

  return {
    schemaVersion: "chart-result.v1",
    method: "progression",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartSettings(),
    inputSnapshot: chartResult().inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    result: {
      natal,
      progressed: natal,
      aspectsToNatal: [],
      warnings: []
    }
  };
}
