import type { CalculationRecordResponse, HumanDesignIndividualResult } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  getActiveHumanDesignCalculations,
  toClientOptionFromHumanDesignCalculation,
  toHumanDesignCalculationResponse
} from "./humanDesignSavedCalculationModel";

const clientId = "22222222-2222-4222-8222-222222222222";

describe("humanDesignSavedCalculationModel", () => {
  it("keeps active Human Design calculations ordered by latest update", () => {
    const older = calculation({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-07-01T10:00:00.000Z"
    });
    const newer = calculation({
      id: "33333333-3333-4333-8333-333333333333",
      updatedAt: "2026-07-03T10:00:00.000Z"
    });
    const archived = calculation({
      id: "44444444-4444-4444-8444-444444444444",
      status: "archived",
      updatedAt: "2026-07-04T10:00:00.000Z"
    });
    const matrix = { ...calculation({ id: "55555555-5555-4555-8555-555555555555" }), module: "matrix" as const };

    expect(getActiveHumanDesignCalculations([older, archived, matrix, newer]).map((item) => item.id))
      .toEqual([newer.id, older.id]);
  });

  it("rehydrates a saved calculation through the typed result contract", () => {
    const saved = calculation({});
    const response = toHumanDesignCalculationResponse(saved);

    expect(response.calculation.id).toBe(saved.id);
    expect(response.result).toEqual(saved.resultData);
  });

  it("rejects records whose resultData is not a Human Design result", () => {
    expect(() =>
      toHumanDesignCalculationResponse(
        calculation({
          resultData: { mode: "individual" },
          resultChecksum: `sha256:${"f".repeat(64)}`
        })
      )
    ).toThrow();
  });

  it("rejects stale Human Design envelopes with mismatched checksums", () => {
    expect(() =>
      toHumanDesignCalculationResponse(
        calculation({
          resultChecksum: `sha256:${"f".repeat(64)}`
        })
      )
    ).toThrow("Human Design calculation result checksum mismatch");

    expect(() =>
      toHumanDesignCalculationResponse(
        calculation({
          requestFingerprint: `sha256:${"e".repeat(64)}`
        })
      )
    ).toThrow("Human Design calculation request fingerprint mismatch");
  });

  it("builds a selected-client option from the persisted CRM subject", () => {
    expect(toClientOptionFromHumanDesignCalculation(calculation({}))).toMatchObject({
      value: clientId,
      label: "Марина Краснова",
      initials: "МК",
      subtitle: "15.07.1990 · сохранённый расчёт",
      birthDateDisplay: "15.07.1990",
      hasBirthDate: true
    });
  });
});

function calculation(overrides: Partial<CalculationRecordResponse>): CalculationRecordResponse {
  const result = humanDesignResult();
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    module: "human_design",
    mode: "individual",
    methodCode: "human_design_classic",
    title: "Марина Краснова — Дизайн человека",
    status: "linked",
    requestFingerprint: result.inputFingerprint.value,
    inputData: {
      mode: "individual",
      source: "client",
      client: { clientId, displayName: "Марина Краснова" },
      birthData: { birthDate: "1990-07-15" }
    },
    resultData: result,
    resultSummary: { type: result.type },
    resultChecksum: result.resultChecksum.value,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "Марина Краснова"
      }
    ],
    links: [
      {
        clientId,
        visibility: "private_to_astrologer",
        linkedAt: "2026-07-01T10:00:00.000Z",
        publishedAt: null
      }
    ],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides
  } as CalculationRecordResponse;
}

function humanDesignResult(): HumanDesignIndividualResult {
  const checksum = `sha256:${"c".repeat(64)}`;
  const bodies = [
    "sun",
    "earth",
    "moon",
    "north_node",
    "south_node",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ] as const;

  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-result.v1",
    mode: "individual",
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-individual-resolved-input.v1",
      value: checksum
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: checksum
    },
    activations: bodies.flatMap((body, index) => [
      {
        side: "personality" as const,
        body,
        longitude: index,
        gate: index === 0 ? 20 : index + 1,
        line: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      },
      {
        side: "design" as const,
        body,
        longitude: index + 20,
        gate: index === 0 ? 34 : index + 20,
        line: (((index + 1) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      }
    ]),
    definedGates: [
      { gate: 20, activatedBy: [{ side: "personality" as const, body: "sun" as const, line: 1 }] },
      { gate: 34, activatedBy: [{ side: "design" as const, body: "sun" as const, line: 2 }] }
    ],
    definedChannels: [
      {
        code: "20-34" as const,
        gates: [20, 34] as [number, number],
        centers: ["throat", "sacral"] as const,
        circuit: "integration" as const
      }
    ],
    definedCenters: [
      { code: "throat" as const, definedByChannels: ["20-34" as const] },
      { code: "sacral" as const, definedByChannels: ["20-34" as const] }
    ],
    type: "generator",
    strategy: "wait_to_respond",
    signature: "satisfaction",
    notSelfTheme: "frustration",
    typeBasis: {
      definedCenterCount: 2,
      sacralDefined: true,
      throatDefined: true,
      throatConnectedMotorCenters: ["sacral" as const]
    },
    authority: "sacral",
    authorityBasis: {
      definedCenters: ["sacral" as const, "throat" as const],
      priority: ["emotional" as const, "sacral" as const],
      selectedBy: "sacral"
    },
    definition: "single",
    definitionComponents: [
      { centers: ["throat" as const, "sacral" as const], channels: ["20-34" as const] }
    ],
    definitionBasis: {
      definedCenterCount: 2,
      componentCount: 1
    },
    incarnationCross: {
      angle: "right_angle",
      profileCode: "1/3",
      gates: {
        personalitySun: { gate: 20, line: 1 },
        personalityEarth: { gate: 1, line: 2 },
        designSun: { gate: 34, line: 2 },
        designEarth: { gate: 2, line: 3 }
      },
      gateSequence: [20, 1, 34, 2]
    },
    profile: {
      personalityLine: 1,
      designLine: 3,
      code: "1/3"
    }
  };
}
