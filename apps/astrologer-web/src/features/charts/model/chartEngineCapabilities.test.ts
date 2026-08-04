import { describe, expect, it } from "vitest";
import {
  chartMethodVersions,
  type ChartProviderMetadata,
  type ChartRenderResult
} from "@elevenhouse/contracts";
import { getChartEngineCapabilities, type ChartCapabilityResult } from "./chartEngineCapabilities";

const readyIdentity = {
  kind: "ready",
  subjectClientId: "22222222-2222-4222-8222-222222222222",
  partnerClientId: null
} as const;

describe("chartEngineCapabilities", () => {
  it("exposes only legacy viewing and explicit recalculation for v1", () => {
    expect(
      getChartEngineCapabilities({
        mode: "natal",
        interpretationMode: "legacy_unclassified",
        result: result("chart-result.v1", "natal"),
        calculationStatus: "calculated",
        identity: readyIdentity
      })
    ).toMatchObject({
      view: "legacy",
      canRecalculate: true,
      canRequestAi: false,
      canRequestPdf: false,
      canLink: false,
      canPublish: false
    });
  });

  it.each([
    ["adult_natal", "natal"],
    ["child", "child_chart"]
  ] as const)(
    "keeps a classified v1 %s calculation upgradeable without granting delivery capabilities",
    (interpretationMode, mode) => {
      expect(
        getChartEngineCapabilities({
          mode,
          interpretationMode,
          result: result("chart-result.v1", "natal"),
          calculationStatus: "calculated",
          identity: readyIdentity
        })
      ).toMatchObject({
        view: "legacy",
        canRecalculate: true,
        canRequestAi: false,
        canRequestPdf: false,
        canLink: false,
        canPublish: false
      });
    }
  );

  it("enables current v2 capabilities only after identity is authoritative", () => {
    const current = result("chart-result.v2", "natal");

    expect(
      getChartEngineCapabilities({
        mode: "natal",
        interpretationMode: "adult_natal",
        result: current,
        calculationStatus: "calculated",
        identity: readyIdentity
      })
    ).toMatchObject({
      view: "current",
      canRecalculate: true,
      canRequestAi: true,
      canRequestPdf: true,
      canLink: true,
      canPublish: true
    });
    expect(
      getChartEngineCapabilities({
        mode: "natal",
        interpretationMode: "adult_natal",
        result: current,
        calculationStatus: "calculated",
        identity: { kind: "pending" }
      })
    ).toMatchObject({ view: "none", canRecalculate: false, canRequestAi: false });
  });

  it("does not grant current capabilities from an unvalidated v2 discriminator", () => {
    expect(
      getChartEngineCapabilities({
        mode: "natal",
        interpretationMode: "adult_natal",
        result: { schemaVersion: "chart-result.v2", method: "natal" },
        calculationStatus: "calculated",
        identity: readyIdentity
      })
    ).toMatchObject({
      view: "none",
      canRecalculate: false,
      canRequestAi: false,
      canRequestPdf: false,
      canLink: false,
      canPublish: false
    });
  });

  it("uses persisted interpretation authority instead of active URL mode", () => {
    const currentNatal = result("chart-result.v2", "natal");

    expect(
      getChartEngineCapabilities({
        mode: "child_chart",
        interpretationMode: "child",
        result: currentNatal,
        calculationStatus: "calculated",
        identity: readyIdentity
      }).canRequestAi
    ).toBe(false);
    expect(
      getChartEngineCapabilities({
        mode: "natal",
        interpretationMode: "adult_natal",
        result: currentNatal,
        calculationStatus: "calculated",
        identity: readyIdentity
      }).canRequestAi
    ).toBe(true);
    expect(
      getChartEngineCapabilities({
        mode: "child_chart",
        interpretationMode: "child",
        result: currentNatal,
        calculationStatus: "calculated",
        identity: readyIdentity
      }).canRequestPdf
    ).toBe(false);
    expect(
      getChartEngineCapabilities({
        mode: "child_chart",
        interpretationMode: "adult_natal",
        result: currentNatal,
        calculationStatus: "calculated",
        identity: readyIdentity
      }).view
    ).toBe("none");
    expect(
      getChartEngineCapabilities({
        mode: "natal",
        interpretationMode: "child",
        result: currentNatal,
        calculationStatus: "calculated",
        identity: readyIdentity
      }).view
    ).toBe("none");
  });

  it("does not invent AI or PDF support for provider modes without those product contours", () => {
    expect(
      getChartEngineCapabilities({
        mode: "transit",
        interpretationMode: "legacy_unclassified",
        result: result("chart-result.v2", "transit"),
        calculationStatus: "calculated",
        identity: readyIdentity
      })
    ).toMatchObject({ canRequestAi: false, canRequestPdf: false });
  });

  it("names every approximate participant in pair warnings", () => {
    const pairIdentity = {
      kind: "ready",
      subjectClientId: readyIdentity.subjectClientId,
      partnerClientId: "55555555-5555-4555-8555-555555555555"
    } as const;
    const capabilities = getChartEngineCapabilities({
      mode: "synastry",
      interpretationMode: "legacy_unclassified",
      result: {
        ...result("chart-result.v2", "synastry"),
        inputSnapshot: { ...inputSnapshot, birthTimePrecision: "approximate" },
        partnerInputSnapshot: {
          ...inputSnapshot,
          birthDate: "1992-08-11",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173,
          birthTimePrecision: "approximate"
        }
      },
      calculationStatus: "calculated",
      identity: pairIdentity,
      participantLabels: { subject: "Анна", partner: "Мария" }
    });

    expect(capabilities.warnings).toEqual([
      {
        code: "approximate_birth_time",
        participants: [
          { role: "subject", label: "Анна" },
          { role: "partner", label: "Мария" }
        ]
      }
    ]);
  });

  it("fails closed for archived calculations", () => {
    expect(
      getChartEngineCapabilities({
        mode: "natal",
        interpretationMode: "adult_natal",
        result: result("chart-result.v2", "natal"),
        calculationStatus: "archived",
        identity: readyIdentity
      })
    ).toMatchObject({
      view: "none",
      canRecalculate: false,
      canRequestAi: false,
      canRequestPdf: false,
      canLink: false,
      canPublish: false
    });
  });
});

function result(
  schemaVersion: ChartCapabilityResult["schemaVersion"],
  method: ChartCapabilityResult["method"]
): ChartCapabilityResult {
  if (schemaVersion === "chart-result.v1") {
    if (method !== "natal") throw new Error("Legacy fixture supports natal only");
    return {
      schemaVersion,
      method,
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings,
      inputSnapshot,
      result: renderResult
    };
  }

  const common = {
    schemaVersion,
    provider,
    reproducibilityFingerprint: `sha256:${"a".repeat(64)}` as const,
    settings
  };
  if (method === "natal") {
    return {
      ...common,
      method,
      methodVersion: chartMethodVersions.natal,
      inputSnapshot,
      result: renderResult
    };
  }
  if (method === "transit") {
    return {
      ...common,
      method,
      methodVersion: chartMethodVersions.transit,
      inputSnapshot,
      transitSnapshot: {
        date: "2026-08-03",
        time: "14:30",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      },
      result: { natal: renderResult, transit: renderResult, aspectsToNatal: [], warnings: [] }
    };
  }
  if (method === "synastry") {
    return {
      ...common,
      method,
      methodVersion: chartMethodVersions.synastry,
      inputSnapshot,
      partnerInputSnapshot: {
        ...inputSnapshot,
        birthDate: "1992-08-11",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      },
      result: {
        primary: renderResult,
        partner: renderResult,
        aspectsBetween: [],
        houseOverlays: [],
        warnings: []
      }
    };
  }
  throw new Error(`Unsupported capability fixture: ${method}`);
}

const settings = {
  zodiac: "tropical" as const,
  houseSystem: "placidus" as const,
  nodeType: "true" as const,
  aspectPreset: "major" as const,
  orbMultiplier: 1
};

const provider: ChartProviderMetadata = {
  name: "kerykeion",
  version: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  ephemeris: "moshier",
  ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  ephemerisDataRevision: null
};

const inputSnapshot = {
  birthDate: "1990-07-15",
  birthTime: "10:30",
  timezone: "Europe/Rome",
  latitude: 41.9028,
  longitude: 12.4964,
  birthTimePrecision: "exact" as const
};

const renderResult: ChartRenderResult = {
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
    elements: { fire: 3, earth: 2, air: 3, water: 2 },
    modalities: { cardinal: 4, fixed: 3, mutable: 3 },
    polarity: { masculine: 6, feminine: 4 }
  },
  warnings: []
};
