import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
import type { HumanDesignIndividualResult } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { job } from "./calculation-pdf.registry.test";
import { createHumanDesignPdfSource } from "./human-design-pdf.source";

const calculationId = "00000000-0000-4000-8000-000000000002";
const ownerUserId = "00000000-0000-4000-8000-000000000003";

describe("Human Design PDF source", () => {
  it("loads a current saved Human Design result and its approved interpretation", async () => {
    const source = createHumanDesignPdfSource(store(record()));

    await expect(
      source.load(
        job({
          module: "human_design",
          methodCode: "human_design_classic",
          sourceLocator: {
            kind: "approved_interpretation",
            interpretationId: "44444444-4444-4444-8444-444444444444"
          }
        })
      )
    ).resolves.toMatchObject({
      kind: "human_design",
      calculationTitle: "Марина Краснова — Дизайн человека",
      approvedInterpretation: "Approved Human Design interpretation",
      result: { mode: "individual", type: "generator" }
    });
  });

  it("rejects stale or invalid source identities as permanent failures", async () => {
    const source = createHumanDesignPdfSource(store(record({ resultChecksum: `sha256:${"f".repeat(64)}` })));

    await expect(
      source.load(
        job({
          module: "human_design",
          methodCode: "human_design_classic",
          sourceLocator: { kind: "approved_interpretation", interpretationId: null }
        })
      )
    ).rejects.toMatchObject({ code: "stale_source" });
    await expect(source.load(job())).rejects.toMatchObject({ code: "stale_source" });
  });
});

function store(calculation: CalculationRecord): CalculationStore {
  return {
    findByOwnerAndId: vi.fn(async () => calculation)
  } as unknown as CalculationStore;
}

function record(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  const result = individualResult();
  return {
    id: calculationId,
    ownerUserId,
    module: "human_design",
    mode: "individual",
    methodCode: "human_design_classic",
    title: "Марина Краснова — Дизайн человека",
    status: "linked",
    requestFingerprint: result.inputFingerprint.value,
    inputData: { mode: "individual" },
    resultData: result,
    resultSummary: { type: result.type },
    resultChecksum: result.resultChecksum.value,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: "55555555-5555-4555-8555-555555555555",
        displayName: "Марина Краснова"
      }
    ],
    links: [],
    interpretations: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        source: "ai",
        status: "approved",
        text: "Approved Human Design interpretation",
        modelId: "gpt-5.5",
        promptVersion: "humanDesign@1",
        approvedAt: "2026-07-23T12:00:00.000Z",
        updatedAt: "2026-07-23T12:00:00.000Z"
      }
    ],
    artifacts: [],
    createdAt: "2026-07-23T12:00:00.000Z",
    updatedAt: "2026-07-23T12:00:00.000Z",
    ...overrides
  };
}

export function individualResult(): HumanDesignIndividualResult {
  const checksum = `sha256:${"a".repeat(64)}`;
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
        longitude: index * 10,
        gate: index === 0 ? 20 : index + 1,
        line: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      },
      {
        side: "design" as const,
        body,
        longitude: index * 10 + 1,
        gate: index === 0 ? 34 : index + 14,
        line: (((index + 1) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      }
    ]),
    definedGates: [
      { gate: 20, activatedBy: [{ side: "personality", body: "sun", line: 1 }] },
      { gate: 34, activatedBy: [{ side: "design", body: "sun", line: 2 }] }
    ],
    definedChannels: [
      {
        code: "20-34",
        gates: [20, 34],
        centers: ["throat", "sacral"],
        circuit: "integration"
      }
    ],
    definedCenters: [
      { code: "throat", definedByChannels: ["20-34"] },
      { code: "sacral", definedByChannels: ["20-34"] }
    ],
    type: "generator",
    strategy: "wait_to_respond",
    signature: "satisfaction",
    notSelfTheme: "frustration",
    typeBasis: {
      definedCenterCount: 2,
      sacralDefined: true,
      throatDefined: true,
      throatConnectedMotorCenters: ["sacral"]
    },
    authority: "sacral",
    authorityBasis: {
      definedCenters: ["sacral", "throat"],
      priority: ["emotional", "sacral"],
      selectedBy: "sacral"
    },
    definition: "single",
    definitionComponents: [{ centers: ["throat", "sacral"], channels: ["20-34"] }],
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
