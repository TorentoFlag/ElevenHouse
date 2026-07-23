import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HumanDesignCalculationResponse,
  HumanDesignPreviewResponse,
  HumanDesignTransitResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import {
  createHumanDesignAiDraft,
  createHumanDesignCalculation,
  getHumanDesignTransit,
  previewHumanDesign,
  recalculateHumanDesignCalculation
} from "./humanDesignApi";

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

  it("recalculates a Human Design calculation with CSRF protection", async () => {
    const response = humanDesignCalculationResponse();
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      recalculateHumanDesignCalculation({
        calculationId: response.calculation.id
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/human-design/calculations/${response.calculation.id}/recalculate`,
      {},
      { csrf: true }
    );
  });

  it("fetches a read-only Human Design transit overlay for a saved calculation", async () => {
    const response = humanDesignTransitResponse();
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(
      getHumanDesignTransit({
        calculationId: "11111111-1111-4111-8111-111111111111",
        query: { instant: "2026-07-23T09:15:00.000Z" }
      })
    ).resolves.toEqual(response);

    expect(get).toHaveBeenCalledWith(
      "/human-design/calculations/11111111-1111-4111-8111-111111111111/transits?instant=2026-07-23T09%3A15%3A00.000Z"
    );
  });

  it("omits the Human Design transit query string when instant is not specified", async () => {
    const response = humanDesignTransitResponse();
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(
      getHumanDesignTransit({
        calculationId: "11111111-1111-4111-8111-111111111111"
      })
    ).resolves.toEqual(response);

    expect(get).toHaveBeenCalledWith(
      "/human-design/calculations/11111111-1111-4111-8111-111111111111/transits"
    );
  });

  it("creates a Human Design AI draft with CSRF and the expected checksum", async () => {
    const response = humanDesignCalculationResponse({
      interpretations: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          status: "draft",
          text: "AI draft"
        }
      ]
    });
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      createHumanDesignAiDraft({
        calculationId: response.calculation.id,
        body: { expectedResultChecksum: response.calculation.resultChecksum }
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/human-design/calculations/${response.calculation.id}/ai-draft`,
      { expectedResultChecksum: response.calculation.resultChecksum },
      { csrf: true }
    );
  });
});

function humanDesignCalculationResponse(
  overrides: Partial<HumanDesignCalculationResponse["calculation"]> = {}
): HumanDesignCalculationResponse {
  const preview = humanDesignResponse();
  if (preview.result.mode !== "individual") {
    throw new Error("Expected individual Human Design API fixture");
  }
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
      updatedAt: "2026-07-22T10:00:00.000Z",
      ...overrides
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

function humanDesignTransitResponse(): HumanDesignTransitResponse {
  const natal = humanDesignResponse().result;
  if (natal.mode !== "individual") {
    throw new Error("Expected individual Human Design transit fixture");
  }
  const checksum = `sha256:${"b".repeat(64)}`;

  return {
    result: {
      methodCode: "human_design_classic",
      engineRevision: 1,
      schemaVersion: "human-design-transit-result.v1",
      mode: "transit",
      natal,
      transitSnapshot: {
        instant: "2026-07-23T09:15:00.000Z",
        date: "2026-07-23",
        time: "09:15",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      },
      transitActivations: [
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
      ].map((body, index) => ({
        side: "transit" as const,
        body: body as never,
        longitude: index * 10,
        gate: index + 1,
        line: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      })),
      transitDefinedGates: [],
      completedChannels: [],
      temporarilyDefinedCenters: [],
      summary: {
        transitActivationCount: 13,
        completedChannelCount: 0,
        temporarilyDefinedCenterCount: 0
      },
      inputFingerprint: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1",
        scope: "human-design-transit-input.v1",
        value: checksum
      },
      resultChecksum: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1",
        value: checksum
      }
    }
  };
}
