import {
  chartMethodVersions,
  chartNatalResultV2Schema,
  type ChartExecutionProfile,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { ChartStoredResultIntegrityError } from "./chart-errors";
import { buildChartResultReproducibilityFingerprint } from "./chart-execution-profile";
import {
  assertStoredChartCalculationIntegrity,
  assertStoredChartCalculationSelfIntegrity
} from "./chart-stored-result-integrity";

const expectedProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};
type NatalChartResultV2 = Extract<ReproducibleChartResult, { readonly method: "natal" }>;

describe("stored chart calculation integrity", () => {
  it("accepts only a canonical v2 result bound to its persisted input and current profile", () => {
    const result = currentNatalResult();

    expect(
      assertStoredChartCalculationIntegrity({
        calculation: calculation(result),
        expectedExecutionProfile: expectedProfile
      })
    ).toEqual(result);
  });

  it("rejects a render-result mutation even when its provenance fingerprint remains valid", () => {
    const result = currentNatalResult();
    const firstPoint = result.result.points[0]!;
    const forged = {
      ...result,
      result: {
        ...result.result,
        points: [
          { ...firstPoint, longitude: firstPoint.longitude + 1 },
          ...result.result.points.slice(1)
        ]
      }
    };

    expect(forged.reproducibilityFingerprint).toBe(
      buildChartResultReproducibilityFingerprint(forged)
    );
    expect(() =>
      assertStoredChartCalculationIntegrity({
        calculation: calculation(forged, {
          resultChecksum: sha256CanonicalJson(result as unknown as CanonicalJson)
        }),
        expectedExecutionProfile: expectedProfile
      })
    ).toThrow(ChartStoredResultIntegrityError);
  });

  it("rejects persisted-input drift and results produced under a different execution profile", () => {
    const result = currentNatalResult();
    const record = calculation(result);

    expect(() =>
      assertStoredChartCalculationIntegrity({
        calculation: {
          ...record,
          inputData: {
            inputSnapshot: { ...result.inputSnapshot, birthDate: "1999-01-01" },
            settings: result.settings
          }
        },
        expectedExecutionProfile: expectedProfile
      })
    ).toThrow(ChartStoredResultIntegrityError);

    expect(() =>
      assertStoredChartCalculationIntegrity({
        calculation: record,
        expectedExecutionProfile: {
          ...expectedProfile,
          expectedEphemeris: "swiss-ephemeris",
          expectedEphemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
          expectedEphemerisDataRevision: `sha256:${"f".repeat(64)}`
        }
      })
    ).toThrow(ChartStoredResultIntegrityError);

    expect(assertStoredChartCalculationSelfIntegrity({ calculation: record })).toEqual(result);
  });
});

function calculation(
  result: NatalChartResultV2,
  overrides: Partial<{
    readonly resultChecksum: string;
    readonly inputData: unknown;
  }> = {}
) {
  return {
    module: "chart" as const,
    methodCode: result.method,
    inputData: {
      inputSnapshot: result.inputSnapshot,
      settings: result.settings
    },
    resultData: result,
    resultChecksum: sha256CanonicalJson(result as unknown as CanonicalJson),
    ...overrides
  };
}

function currentNatalResult(): NatalChartResultV2 {
  const candidate = chartNatalResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "natal",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: renderResult()
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function renderResult() {
  return {
    points: [
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
      "ascendant",
      "midheaven",
      "north_node",
      "south_node"
    ].map((id, index) => ({
      id,
      label: id,
      longitude: index * 20,
      sign: "aries",
      signDegree: index,
      house: (index % 12) + 1,
      retrograde: false
    })),
    houses: Array.from({ length: 12 }, (_, index) => ({
      number: index + 1,
      longitude: index * 30,
      sign: "aries",
      signDegree: 0
    })),
    aspects: [],
    distributions: {
      elements: { fire: 3, earth: 3, air: 2, water: 2 },
      modalities: { cardinal: 4, fixed: 3, mutable: 3 },
      polarity: { masculine: 5, feminine: 5 }
    },
    warnings: []
  };
}
