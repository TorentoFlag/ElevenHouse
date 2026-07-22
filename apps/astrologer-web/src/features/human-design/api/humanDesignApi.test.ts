import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HumanDesignCalculationResponse,
  HumanDesignPreviewResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import { createHumanDesignCalculation, previewHumanDesign } from "./humanDesignApi";

const clientId = "22222222-2222-4222-8222-222222222222";

describe("humanDesignApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("previews Human Design mechanics from owner-scoped CRM client birth data", async () => {
    const response = humanDesignResponse();
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      previewHumanDesign({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith("/human-design/preview", {
      mode: "individual",
      methodCode: "human_design_classic",
      source: "client",
      clientId
    });
  });

  it("creates a linked Human Design calculation with CSRF protection", async () => {
    const response = humanDesignCalculationResponse();
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      createHumanDesignCalculation({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      "/human-design/calculations",
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId
      },
      { csrf: true }
    );
  });
});

function humanDesignCalculationResponse(): HumanDesignCalculationResponse {
  const preview = humanDesignResponse();
  return {
    calculation: {
      id: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "33333333-3333-4333-8333-333333333333",
      module: "human_design",
      mode: "individual",
      methodCode: "human_design_classic",
      title: "Client — Дизайн человека",
      status: "linked",
      requestFingerprint: preview.result.inputFingerprint.value,
      inputData: { mode: "individual" },
      resultData: preview.result,
      resultSummary: { type: preview.result.type },
      resultChecksum: preview.result.resultChecksum.value,
      participants: [
        {
          role: "subject",
          source: "crm_client",
          clientId,
          displayName: "Client"
        }
      ],
      links: [
        {
          clientId,
          visibility: "private_to_astrologer",
          linkedAt: "2026-07-22T10:00:00.000Z",
          publishedAt: null
        }
      ],
      interpretations: [],
      artifacts: [],
      createdAt: "2026-07-22T10:00:00.000Z",
      updatedAt: "2026-07-22T10:00:00.000Z"
    },
    result: preview.result
  };
}

function humanDesignResponse(): HumanDesignPreviewResponse {
  const checksum = `sha256:${"a".repeat(64)}`;

  return {
    result: {
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
      activations: [
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
      ].flatMap((body, index) => [
        {
          side: "personality" as const,
          body: body as never,
          longitude: index * 10,
          gate: index + 1,
          line: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
        },
        {
          side: "design" as const,
          body: body as never,
          longitude: index * 10 + 1,
          gate: index + 14,
          line: (((index + 1) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
        }
      ]),
      definedGates: [],
      definedChannels: [],
      definedCenters: [],
      type: "generator",
      strategy: "wait_to_respond",
      signature: "satisfaction",
      notSelfTheme: "frustration",
      typeBasis: {
        definedCenterCount: 0,
        sacralDefined: true,
        throatDefined: false,
        throatConnectedMotorCenters: []
      },
      authority: "sacral",
      authorityBasis: {
        definedCenters: ["sacral"],
        priority: ["emotional", "sacral"],
        selectedBy: "sacral"
      },
      definition: "single",
      definitionComponents: [],
      definitionBasis: {
        definedCenterCount: 0,
        componentCount: 1
      },
      incarnationCross: {
        angle: "right_angle",
        profileCode: "1/3",
        gates: {
          personalitySun: { gate: 1, line: 1 },
          personalityEarth: { gate: 2, line: 2 },
          designSun: { gate: 14, line: 3 },
          designEarth: { gate: 15, line: 4 }
        },
        gateSequence: [1, 2, 14, 15]
      },
      profile: {
        personalityLine: 1,
        designLine: 3,
        code: "1/3"
      }
    }
  };
}
