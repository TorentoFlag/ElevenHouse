import { describe, expect, it } from "vitest";
import {
  chartMethodVersions,
  type ChartCalculationMethod,
  type ChartExecutionProfile,
  type ChartResult,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import {
  CalculationNotFoundError,
  CalculationResultChangedError,
  CalculationValidationError
} from "../calculations/calculation-errors";
import type { CalculationRecord } from "../calculations/calculation-store";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { ChartStoredResultIntegrityError } from "./chart-errors";
import { buildChartResultReproducibilityFingerprint } from "./chart-execution-profile";
import {
  deriveChartCalculationCapabilities,
  prepareChartRecalculation as prepareChartRecalculationWithProfile,
  resolveChartAiDraftTariffCapabilities
} from "./chart-recalculation";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const calculationId = "22222222-2222-4222-8222-222222222222";
const subjectClientId = "33333333-3333-4333-8333-333333333333";
const partnerClientId = "44444444-4444-4444-8444-444444444444";
const sourceChecksum = `sha256:${"a".repeat(64)}`;
const expectedExecutionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};
type NatalChartResultV2 = Extract<ReproducibleChartResult, { readonly method: "natal" }>;

function prepareChartRecalculation(
  input: Omit<
    Parameters<typeof prepareChartRecalculationWithProfile>[0],
    "expectedExecutionProfile"
  > & {
    readonly expectedExecutionProfile?: ChartExecutionProfile;
  }
) {
  return prepareChartRecalculationWithProfile({
    ...input,
    expectedExecutionProfile: input.expectedExecutionProfile ?? expectedExecutionProfile
  });
}

describe("chart recalculation preparation", () => {
  it.each([
    ["natal", null],
    ["astrocartography", null],
    ["transit", { transitSnapshot: transitSnapshot() }],
    ["synastry", null],
    ["composite", null],
    ["solar_return", { solarReturnSnapshot: solarReturnRequestSnapshot() }],
    ["progression", { progressionSnapshot: progressionRequestSnapshot() }],
    ["horary", { questionSnapshot: horaryQuestionSnapshot() }]
  ] satisfies readonly (readonly [ChartCalculationMethod, unknown])[])(
    "preserves the %s target, event and ordered participant identities",
    (method, eventSnapshot) => {
      const calculation = calculationRecord(method);
      const replacementSettings = {
        zodiac: "tropical" as const,
        houseSystem: "whole_sign" as const,
        nodeType: "mean" as const,
        aspectPreset: "major_minor" as const,
        orbMultiplier: 0.75
      };

      const target = prepareChartRecalculation({
        calculation,
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum,
        settings: replacementSettings
      });

      expect(target).toEqual({
        calculationId,
        expectedSourceChecksum: sourceChecksum,
        sourceSchemaVersion: "chart-result.v1",
        interpretationMode: "legacy_unclassified",
        method,
        settings: replacementSettings,
        participants:
          method === "synastry" || method === "composite"
            ? [
                { role: "subject", clientId: subjectClientId },
                { role: "partner", clientId: partnerClientId }
              ]
            : [{ role: "subject", clientId: subjectClientId }],
        eventSnapshot
      });
    }
  );

  it("does not carry historical participant birth snapshots into reconstruction", () => {
    const target = prepareChartRecalculation({
      calculation: calculationRecord("synastry"),
      ownerUserId,
      calculationId,
      expectedResultChecksum: sourceChecksum
    });

    const serialized = JSON.stringify(target);
    expect(serialized).not.toContain("1990-07-15");
    expect(serialized).not.toContain("1992-08-11");
    expect(target.participants).toEqual([
      { role: "subject", clientId: subjectClientId },
      { role: "partner", clientId: partnerClientId }
    ]);
  });

  it("preserves the persisted child product mode without age or snapshot inference", () => {
    const calculation = {
      ...calculationRecord("natal"),
      interpretationMode: "child" as const
    };

    expect(
      prepareChartRecalculation({
        calculation,
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum
      }).interpretationMode
    ).toBe("child");
  });

  it("migrates the precise legacy relationship row defect without trusting inconsistent identity", () => {
    const legacy = calculationRecord("synastry");

    expect(legacy).toMatchObject({
      mode: "individual",
      participants: [{ role: "subject", clientId: subjectClientId }]
    });
    expect(
      prepareChartRecalculation({
        calculation: legacy,
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum
      }).participants
    ).toEqual([
      { role: "subject", clientId: subjectClientId },
      { role: "partner", clientId: partnerClientId }
    ]);

    const correctedPair = {
      ...legacy,
      mode: "compatibility" as const,
      participants: [
        participant("subject", subjectClientId),
        participant("partner", partnerClientId)
      ]
    };
    expect(
      prepareChartRecalculation({
        calculation: correctedPair,
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum
      }).participants
    ).toEqual([
      { role: "subject", clientId: subjectClientId },
      { role: "partner", clientId: partnerClientId }
    ]);

    const inconsistentInput = {
      ...legacy,
      inputData: {
        inputSnapshot: {
          ...persistedJobInputSnapshot("synastry"),
          relationshipSnapshot: {
            primaryClientId: subjectClientId,
            partnerClientId: "55555555-5555-4555-8555-555555555555"
          }
        },
        settings: settings()
      }
    };
    const inconsistentResult = {
      ...legacy,
      resultData: {
        ...legacyResult("synastry"),
        relationshipSnapshot: {
          primaryClientId: subjectClientId,
          partnerClientId: "55555555-5555-4555-8555-555555555555"
        }
      }
    };
    for (const calculation of [inconsistentInput, inconsistentResult]) {
      expect(() =>
        prepareChartRecalculation({
          calculation,
          ownerUserId,
          calculationId,
          expectedResultChecksum: sourceChecksum
        })
      ).toThrow(ChartStoredResultIntegrityError);
    }
  });

  it("accepts uppercase legacy relationship UUIDs and normalizes their semantic identity", () => {
    const legacy = calculationRecord("synastry");
    const lowercaseSubjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const lowercasePartnerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const uppercaseRelationship = {
      primaryClientId: lowercaseSubjectId.toUpperCase(),
      partnerClientId: lowercasePartnerId.toUpperCase()
    };
    const calculation = {
      ...legacy,
      participants: [participant("subject", lowercaseSubjectId)],
      inputData: {
        inputSnapshot: {
          ...persistedJobInputSnapshot("synastry"),
          relationshipSnapshot: uppercaseRelationship
        },
        settings: settings()
      },
      resultData: {
        ...legacyResult("synastry"),
        relationshipSnapshot: uppercaseRelationship
      }
    };

    expect(
      prepareChartRecalculation({
        calculation,
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum,
        expectedExecutionProfile
      }).participants
    ).toEqual([
      { role: "subject", clientId: lowercaseSubjectId },
      { role: "partner", clientId: lowercasePartnerId }
    ]);
  });

  it("rejects a legacy event whose persisted job input disagrees with the visible result", () => {
    const calculation = calculationRecord("transit");

    expect(() =>
      prepareChartRecalculation({
        calculation: {
          ...calculation,
          inputData: {
            inputSnapshot: {
              inputSnapshot: birthSnapshot(),
              transitSnapshot: { ...transitSnapshot(), date: "2040-01-01" }
            },
            settings: settings()
          }
        },
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum,
        expectedExecutionProfile
      })
    ).toThrow(ChartStoredResultIntegrityError);
  });

  it("rejects a current result whose canonical checksum or execution profile is stale", () => {
    const current = v2NatalResult();
    const canonicalChecksum = sha256CanonicalJson(current as unknown as CanonicalJson);
    const calculation = {
      ...calculationRecord("natal"),
      resultData: current,
      resultChecksum: canonicalChecksum
    };

    expect(() =>
      prepareChartRecalculation({
        calculation: {
          ...calculation,
          resultData: {
            ...current,
            result: {
              ...current.result,
              points: [
                { ...current.result.points[0]!, longitude: 42 },
                ...current.result.points.slice(1)
              ]
            }
          }
        },
        ownerUserId,
        calculationId,
        expectedResultChecksum: canonicalChecksum,
        expectedExecutionProfile
      })
    ).toThrow(ChartStoredResultIntegrityError);

    expect(() =>
      prepareChartRecalculation({
        calculation,
        ownerUserId,
        calculationId,
        expectedResultChecksum: canonicalChecksum,
        expectedExecutionProfile: {
          ...expectedExecutionProfile,
          expectedEphemeris: "swiss-ephemeris",
          expectedEphemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
          expectedEphemerisDataRevision: `sha256:${"f".repeat(64)}`
        }
      })
    ).toThrow(ChartStoredResultIntegrityError);
  });

  it("rejects a foreign ID or owner as not found", () => {
    const calculation = calculationRecord("natal");

    expect(() =>
      prepareChartRecalculation({
        calculation,
        ownerUserId: "55555555-5555-4555-8555-555555555555",
        calculationId,
        expectedResultChecksum: sourceChecksum
      })
    ).toThrow(CalculationNotFoundError);
    expect(() =>
      prepareChartRecalculation({
        calculation,
        ownerUserId,
        calculationId: "66666666-6666-4666-8666-666666666666",
        expectedResultChecksum: sourceChecksum
      })
    ).toThrow(CalculationNotFoundError);
  });

  it("rejects an archived target and a stale source checksum", () => {
    expect(() =>
      prepareChartRecalculation({
        calculation: { ...calculationRecord("natal"), status: "archived" },
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum
      })
    ).toThrow(CalculationValidationError);
    expect(() =>
      prepareChartRecalculation({
        calculation: calculationRecord("natal"),
        ownerUserId,
        calculationId,
        expectedResultChecksum: `sha256:${"f".repeat(64)}`
      })
    ).toThrow(CalculationResultChangedError);
  });

  it("fails closed on malformed persisted input, result-method drift or participant identity", () => {
    const transit = calculationRecord("transit");
    const malformedCases: readonly CalculationRecord[] = [
      { ...transit, inputData: { inputSnapshot: {}, settings: settings() } },
      { ...transit, resultData: legacyResult("natal") },
      {
        ...transit,
        participants: [
          {
            role: "subject",
            source: "manual",
            clientId: null,
            displayName: "Manual"
          }
        ]
      },
      {
        ...calculationRecord("synastry"),
        participants: [
          participant("partner", partnerClientId),
          participant("subject", subjectClientId)
        ]
      }
    ];

    for (const calculation of malformedCases) {
      expect(() =>
        prepareChartRecalculation({
          calculation,
          ownerUserId,
          calculationId,
          expectedResultChecksum: sourceChecksum
        })
      ).toThrow(ChartStoredResultIntegrityError);
    }
  });

  it("keeps legacy v1 visible only for explicit recalculation and exposes current v2 separately", () => {
    const current = v2NatalResult();
    for (const interpretationMode of ["legacy_unclassified", "adult_natal", "child"] as const) {
      expect(
        deriveChartCalculationCapabilities({
          calculation: { ...calculationRecord("natal"), interpretationMode },
          expectedExecutionProfile
        })
      ).toEqual(["view_legacy", "recalculate"]);
    }
    expect(
      deriveChartCalculationCapabilities({
        calculation: {
          ...calculationRecord("natal"),
          interpretationMode: "adult_natal",
          resultData: current,
          resultChecksum: sha256CanonicalJson(current as unknown as CanonicalJson)
        },
        expectedExecutionProfile
      })
    ).toEqual(["view_current", "recalculate", "link", "publish", "ai_draft", "pdf"]);
  });

  it("keeps only unclassified natal capabilities fail-closed", () => {
    const current = v2NatalResult();
    const currentChecksum = sha256CanonicalJson(current as unknown as CanonicalJson);
    const calculation = {
      ...calculationRecord("natal"),
      resultData: current,
      resultChecksum: currentChecksum
    };

    expect(
      deriveChartCalculationCapabilities({
        calculation: { ...calculation, interpretationMode: "child" },
        expectedExecutionProfile
      })
    ).toEqual(["view_current", "recalculate", "link", "publish", "ai_draft", "pdf"]);
    expect(
      deriveChartCalculationCapabilities({
        calculation: { ...calculation, interpretationMode: "legacy_unclassified" },
        expectedExecutionProfile
      })
    ).toEqual(["view_current", "recalculate"]);
  });

  it.each([
    ["natal", ["ai", "natal"]],
    ["astrocartography", ["ai", "forecast"]],
    ["transit", ["ai", "forecast"]],
    ["synastry", ["ai", "synastry"]],
    ["composite", ["ai", "synastry"]],
    ["solar_return", ["ai", "solar"]],
    ["progression", ["ai", "forecast"]],
    ["horary", ["ai", "horar"]]
  ] satisfies readonly (readonly [ChartCalculationMethod, readonly string[]])[])(
    "resolves %s AI draft tariff requirements from the canonical chart method map",
    (method, expectedCapabilities) => {
      expect(resolveChartAiDraftTariffCapabilities(method)).toEqual(expectedCapabilities);
    }
  );

  it("fails closed when a format-valid v2 result has a forged reproducibility fingerprint", () => {
    const current = v2NatalResult();
    const forged = {
      ...current,
      reproducibilityFingerprint: `sha256:${"0".repeat(64)}`
    };

    expect(() =>
      deriveChartCalculationCapabilities({
        calculation: {
          ...calculationRecord("natal"),
          resultData: forged,
          resultChecksum: sha256CanonicalJson(forged as unknown as CanonicalJson)
        },
        expectedExecutionProfile
      })
    ).toThrow(ChartStoredResultIntegrityError);
    expect(() =>
      prepareChartRecalculation({
        calculation: { ...calculationRecord("natal"), resultData: forged },
        ownerUserId,
        calculationId,
        expectedResultChecksum: sourceChecksum
      })
    ).toThrow(ChartStoredResultIntegrityError);
  });
});

function calculationRecord(method: ChartCalculationMethod): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "chart",
    mode: "individual",
    interpretationMode: "legacy_unclassified",
    methodCode: method,
    title: `Saved ${method}`,
    status: "calculated",
    participants: [participant("subject", subjectClientId)],
    links: [],
    interpretations: [],
    artifacts: [],
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {
      inputSnapshot: persistedJobInputSnapshot(method),
      settings: settings()
    },
    resultData: legacyResult(method),
    resultSummary: { method },
    resultChecksum: sourceChecksum,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z"
  };
}

function participant(role: "subject" | "partner", clientId: string) {
  return {
    role,
    source: "crm_client" as const,
    clientId,
    displayName: role === "subject" ? "Subject" : "Partner"
  };
}

function persistedJobInputSnapshot(method: ChartCalculationMethod): Record<string, unknown> {
  if (method === "natal") return birthSnapshot();
  if (method === "astrocartography") return { inputSnapshot: birthSnapshot() };
  if (method === "transit") {
    return { inputSnapshot: birthSnapshot(), transitSnapshot: transitSnapshot() };
  }
  if (method === "synastry" || method === "composite") {
    return {
      inputSnapshot: birthSnapshot(),
      partnerInputSnapshot: partnerBirthSnapshot(),
      relationshipSnapshot: {
        primaryClientId: subjectClientId,
        partnerClientId
      }
    };
  }
  if (method === "solar_return") {
    return {
      inputSnapshot: birthSnapshot(),
      solarReturnSnapshot: solarReturnRequestSnapshot()
    };
  }
  if (method === "progression") {
    return {
      inputSnapshot: birthSnapshot(),
      progressionSnapshot: progressionRequestSnapshot()
    };
  }
  return { questionSnapshot: horaryQuestionSnapshot() };
}

function legacyResult(method: ChartCalculationMethod): ChartResult {
  const common = {
    schemaVersion: "chart-result.v1" as const,
    method,
    provider: {
      name: "kerykeion" as const,
      version: "5.12.9",
      ephemeris: "swiss-ephemeris" as const
    },
    settings: settings()
  };
  if (method === "natal") {
    return { ...common, method, inputSnapshot: birthSnapshot(), result: renderResult() };
  }
  if (method === "astrocartography") {
    return {
      ...common,
      method,
      inputSnapshot: birthSnapshot(),
      result: { lines: [], warnings: [] }
    };
  }
  if (method === "transit") {
    return {
      ...common,
      method,
      inputSnapshot: birthSnapshot(),
      transitSnapshot: transitSnapshot(),
      result: {
        natal: renderResult(),
        transit: renderResult(),
        aspectsToNatal: [],
        warnings: []
      }
    };
  }
  if (method === "synastry") {
    return {
      ...common,
      method,
      inputSnapshot: birthSnapshot(),
      partnerInputSnapshot: partnerBirthSnapshot(),
      relationshipSnapshot: {
        primaryClientId: subjectClientId,
        partnerClientId
      },
      result: {
        primary: renderResult(),
        partner: renderResult(),
        aspectsBetween: [],
        houseOverlays: [],
        warnings: []
      }
    };
  }
  if (method === "composite") {
    return {
      ...common,
      method,
      inputSnapshot: birthSnapshot(),
      partnerInputSnapshot: partnerBirthSnapshot(),
      relationshipSnapshot: {
        primaryClientId: subjectClientId,
        partnerClientId
      },
      result: renderResult()
    };
  }
  if (method === "solar_return") {
    return {
      ...common,
      method,
      inputSnapshot: birthSnapshot(),
      solarReturnSnapshot: {
        ...solarReturnRequestSnapshot(),
        resolvedAt: "2026-07-15T08:00:00.000Z"
      },
      result: {
        natal: renderResult(),
        solarReturn: renderResult(),
        aspectsToNatal: [],
        warnings: []
      }
    };
  }
  if (method === "progression") {
    return {
      ...common,
      method,
      inputSnapshot: birthSnapshot(),
      progressionSnapshot: {
        ...progressionRequestSnapshot(),
        calculationBasis: {
          symbolicDate: "1990-08-20",
          ageDays: 36,
          dayForYearRatio: 1
        }
      },
      result: {
        natal: renderResult(),
        progressed: renderResult(),
        aspectsToNatal: [],
        warnings: []
      }
    };
  }
  return {
    ...common,
    method,
    questionSnapshot: horaryQuestionSnapshot(),
    result: renderResult()
  };
}

function v2NatalResult(): NatalChartResultV2 {
  const candidate = {
    ...legacyResult("natal"),
    schemaVersion: "chart-result.v2",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"c".repeat(64)}`
  } as NatalChartResultV2;
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function settings() {
  return {
    zodiac: "tropical" as const,
    houseSystem: "placidus" as const,
    nodeType: "true" as const,
    aspectPreset: "major" as const,
    orbMultiplier: 1
  };
}

function birthSnapshot() {
  return {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
}

function partnerBirthSnapshot() {
  return {
    ...birthSnapshot(),
    birthDate: "1992-08-11",
    birthTime: "08:15",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
}

function transitSnapshot() {
  return {
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
}

function solarReturnRequestSnapshot() {
  return {
    year: 2026,
    returnType: "solar" as const,
    location: {
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964
    }
  };
}

function progressionRequestSnapshot() {
  return { targetDate: "2026-07-23", progressionType: "secondary" as const };
}

function horaryQuestionSnapshot() {
  return {
    question: "Should I accept the offer?",
    category: "career" as const,
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
}

function renderResult() {
  const pointIds = [
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
  ];
  return {
    points: pointIds.map((id, index) => ({
      id,
      label: id,
      longitude: index * 20,
      sign: "Aries",
      signDegree: index,
      house: (index % 12) + 1,
      retrograde: false
    })),
    houses: Array.from({ length: 12 }, (_, index) => ({
      number: index + 1,
      longitude: index * 30,
      sign: "Aries",
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
