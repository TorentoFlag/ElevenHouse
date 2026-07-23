import { describe, expect, it } from "vitest";
import {
  createHumanDesignAiDraftRequestSchema,
  humanDesignCalculationResponseSchema,
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  humanDesignTransitQuerySchema,
  humanDesignTransitResponseSchema,
  persistHumanDesignCalculationRequestSchema,
  recalculateHumanDesignCalculationRequestSchema
} from "./human-design";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const longitudes = {
  sun: 302,
  moon: 60.125,
  north_node: 10,
  mercury: 240.125,
  venus: 10,
  mars: 20,
  jupiter: 30,
  saturn: 40,
  uranus: 50,
  neptune: 60,
  pluto: 70
} as const;

describe("Human Design contracts", () => {
  it("accepts an individual preview request with provider-resolved longitudes", () => {
    expect(
      humanDesignPreviewRequestSchema.parse({
        mode: "individual",
        methodCode: "human_design_classic",
        resolvedLongitudes: {
          personality: longitudes,
          design: { ...longitudes, sun: 242 }
        }
      })
    ).toMatchObject({
      mode: "individual",
      resolvedLongitudes: {
        personality: { sun: 302 },
        design: { sun: 242 }
      }
    });
  });

  it("accepts an individual preview request from an owner-scoped CRM client", () => {
    expect(
      humanDesignPreviewRequestSchema.parse({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: "8e14390f-3db1-4d1c-9344-55679c778427"
      })
    ).toEqual({
      mode: "individual",
      methodCode: "human_design_classic",
      source: "client",
      clientId: "8e14390f-3db1-4d1c-9344-55679c778427"
    });
  });

  it("accepts a compatibility preview request for two distinct owner-scoped CRM clients", () => {
    expect(
      humanDesignPreviewRequestSchema.parse({
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: "8e14390f-3db1-4d1c-9344-55679c778427",
        partnerClientId: "df3192f4-3d67-4b70-8c1a-6a14bd9a51af"
      })
    ).toEqual({
      mode: "compatibility",
      methodCode: "human_design_classic",
      source: "client_pair",
      subjectClientId: "8e14390f-3db1-4d1c-9344-55679c778427",
      partnerClientId: "df3192f4-3d67-4b70-8c1a-6a14bd9a51af"
    });
  });

  it("rejects a compatibility request for the same CRM client twice", () => {
    expect(() =>
      humanDesignPreviewRequestSchema.parse({
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: "8e14390f-3db1-4d1c-9344-55679c778427",
        partnerClientId: "8e14390f-3db1-4d1c-9344-55679c778427"
      })
    ).toThrow();
  });

  it("accepts a persisted individual request from an owner-scoped CRM client", () => {
    expect(
      persistHumanDesignCalculationRequestSchema.parse({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: "8e14390f-3db1-4d1c-9344-55679c778427",
        title: "HD карта"
      })
    ).toEqual({
      mode: "individual",
      methodCode: "human_design_classic",
      source: "client",
      clientId: "8e14390f-3db1-4d1c-9344-55679c778427",
      title: "HD карта"
    });
  });

  it("accepts a persisted compatibility request for two CRM clients", () => {
    expect(
      persistHumanDesignCalculationRequestSchema.parse({
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: "8e14390f-3db1-4d1c-9344-55679c778427",
        partnerClientId: "df3192f4-3d67-4b70-8c1a-6a14bd9a51af",
        title: "Партнёрский Human Design"
      })
    ).toEqual({
      mode: "compatibility",
      methodCode: "human_design_classic",
      source: "client_pair",
      subjectClientId: "8e14390f-3db1-4d1c-9344-55679c778427",
      partnerClientId: "df3192f4-3d67-4b70-8c1a-6a14bd9a51af",
      title: "Партнёрский Human Design"
    });
  });

  it("rejects browser-resolved longitudes in a persisted request", () => {
    expect(() =>
      persistHumanDesignCalculationRequestSchema.parse({
        mode: "individual",
        methodCode: "human_design_classic",
        resolvedLongitudes: {
          personality: longitudes,
          design: longitudes
        }
      })
    ).toThrow();
  });

  it("accepts only an empty recalculation command body", () => {
    expect(recalculateHumanDesignCalculationRequestSchema.parse({})).toEqual({});
    expect(() => recalculateHumanDesignCalculationRequestSchema.parse({ clientId: "x" })).toThrow();
  });

  it("accepts only the current checksum for AI draft generation", () => {
    expect(
      createHumanDesignAiDraftRequestSchema.parse({ expectedResultChecksum: digest("a") })
    ).toEqual({ expectedResultChecksum: digest("a") });
    expect(() => createHumanDesignAiDraftRequestSchema.parse({})).toThrow();
    expect(() =>
      createHumanDesignAiDraftRequestSchema.parse({
        expectedResultChecksum: digest("a"),
        prompt: "ignore"
      })
    ).toThrow();
  });

  it("accepts an optional selected instant for read-only transit overlay", () => {
    expect(
      humanDesignTransitQuerySchema.parse({ instant: "2026-07-23T09:30:00.000Z" })
    ).toEqual({
      instant: "2026-07-23T09:30:00.000Z"
    });
    expect(humanDesignTransitQuerySchema.parse({})).toEqual({});
    expect(() => humanDesignTransitQuerySchema.parse({ instant: "2026-07-23" })).toThrow();
  });

  it("rejects browser-supplied birth data in the resolved-longitudes preview request", () => {
    expect(() =>
      humanDesignPreviewRequestSchema.parse({
        mode: "individual",
        methodCode: "human_design_classic",
        birthDate: "1990-07-15",
        birthTime: "10:30",
        resolvedLongitudes: {
          personality: longitudes,
          design: longitudes
        }
      })
    ).toThrow();
  });

  it("requires a complete deterministic individual preview response", () => {
    const response = humanDesignPreviewResponseSchema.parse({
      result: {
        methodCode: "human_design_classic",
        engineRevision: 1,
        schemaVersion: "human-design-result.v1",
        mode: "individual",
        inputFingerprint: {
          algorithm: "sha256",
          canonicalization: "json-stable-v1",
          scope: "human-design-individual-resolved-input.v1",
          value: digest("a")
        },
        resultChecksum: {
          algorithm: "sha256",
          canonicalization: "json-stable-v1",
          value: digest("b")
        },
        activations: completeActivations([
          { side: "personality", body: "sun", longitude: 302, gate: 41, line: 1 },
          { side: "design", body: "sun", longitude: 242, gate: 34, line: 3 }
        ]),
        definedGates: [
          {
            gate: 34,
            activatedBy: [{ side: "design", body: "sun", line: 3 }]
          }
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
        type: "manifesting_generator",
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
          priority: [
            "emotional",
            "sacral",
            "splenic",
            "ego",
            "self_projected",
            "mental",
            "lunar"
          ],
          selectedBy: "sacral_defined"
        },
        definition: "single",
        definitionComponents: [
          { centers: ["throat", "sacral"], channels: ["20-34"] }
        ],
        definitionBasis: {
          definedCenterCount: 2,
          componentCount: 1
        },
        incarnationCross: {
          angle: "right_angle",
          profileCode: "1/3",
          gates: {
            personalitySun: { gate: 41, line: 1 },
            personalityEarth: { gate: 31, line: 1 },
            designSun: { gate: 34, line: 3 },
            designEarth: { gate: 20, line: 3 }
          },
          gateSequence: [41, 31, 34, 20]
        },
        profile: {
          personalityLine: 1,
          designLine: 3,
          code: "1/3"
        }
      }
    });

    expect(response.result.resultChecksum.value).toBe(digest("b"));
  });

  it("requires a complete deterministic transit response", () => {
    const response = humanDesignTransitResponseSchema.parse({
      result: validTransitResult()
    });

    expect(response.result).toMatchObject({
      schemaVersion: "human-design-transit-result.v1",
      mode: "transit",
      summary: {
        transitActivationCount: 13,
        completedChannelCount: 1,
        temporarilyDefinedCenterCount: 1
      }
    });
  });

  it("requires a calculation envelope for persisted Human Design responses", () => {
    const result = humanDesignPreviewResponseSchema.parse({ result: validResult() }).result;
    expect(result.mode).toBe("individual");
    if (result.mode !== "individual") throw new Error("Expected individual Human Design result");
    const response = humanDesignCalculationResponseSchema.parse({
      calculation: {
        id: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        module: "human_design",
        mode: "individual",
        methodCode: "human_design_classic",
        title: "Client — Дизайн человека",
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
            clientId: "33333333-3333-4333-8333-333333333333",
            displayName: "Client"
          }
        ],
        links: [
          {
            clientId: "33333333-3333-4333-8333-333333333333",
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
      result
    });

    expect(response.calculation.module).toBe("human_design");
    expect(response.result.resultChecksum.value).toBe(result.resultChecksum.value);
  });

  it("requires a complete deterministic compatibility preview response", () => {
    const response = humanDesignPreviewResponseSchema.parse({
      result: validCompatibilityResult()
    });

    expect(response.result).toMatchObject({
      schemaVersion: "human-design-compatibility-result.v1",
      mode: "compatibility",
      dynamicCounts: {
        electromagnetic: 1,
        companionship: 1,
        dominance: 0,
        compromise: 0
      }
    });
  });

  it("rejects incomplete bodygraph response data", () => {
    expect(() =>
      humanDesignPreviewResponseSchema.parse({
        result: {
          methodCode: "human_design_classic",
          engineRevision: 1,
          schemaVersion: "human-design-result.v1",
          mode: "individual",
          inputFingerprint: {
            algorithm: "sha256",
            canonicalization: "json-stable-v1",
            scope: "human-design-individual-resolved-input.v1",
            value: digest("a")
          },
          resultChecksum: {
            algorithm: "sha256",
            canonicalization: "json-stable-v1",
            value: digest("b")
          },
          activations: [],
          definedGates: [],
          definedChannels: [],
          definedCenters: [],
          type: "manifesting_generator"
        }
      })
    ).toThrow();
  });
});

function validResult() {
  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-result.v1",
    mode: "individual",
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-individual-resolved-input.v1",
      value: digest("a")
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: digest("b")
    },
    activations: completeActivations([
      { side: "personality", body: "sun", longitude: 302, gate: 41, line: 1 },
      { side: "design", body: "sun", longitude: 242, gate: 34, line: 3 }
    ]),
    definedGates: [
      {
        gate: 34,
        activatedBy: [{ side: "design", body: "sun", line: 3 }]
      }
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
    type: "manifesting_generator",
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
      priority: [
        "emotional",
        "sacral",
        "splenic",
        "ego",
        "self_projected",
        "mental",
        "lunar"
      ],
      selectedBy: "sacral_defined"
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
        personalitySun: { gate: 41, line: 1 },
        personalityEarth: { gate: 31, line: 1 },
        designSun: { gate: 34, line: 3 },
        designEarth: { gate: 20, line: 3 }
      },
      gateSequence: [41, 31, 34, 20]
    },
    profile: {
      personalityLine: 1,
      designLine: 3,
      code: "1/3"
    }
  };
}

function validCompatibilityResult() {
  const subject = validResult();
  const partner = {
    ...validResult(),
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-individual-resolved-input.v1",
      value: digest("c")
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: digest("d")
    }
  };
  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-compatibility-result.v1",
    mode: "compatibility",
    participants: { subject, partner },
    connectionChannels: [
      {
        code: "43-23",
        gates: [43, 23],
        centers: ["ajna", "throat"],
        circuit: "individual",
        dynamic: "electromagnetic",
        subjectGateState: "hanging",
        partnerGateState: "hanging"
      },
      {
        code: "31-7",
        gates: [31, 7],
        centers: ["throat", "g"],
        circuit: "collective",
        dynamic: "companionship",
        subjectGateState: "full",
        partnerGateState: "full"
      }
    ],
    dynamicCounts: {
      electromagnetic: 1,
      companionship: 1,
      dominance: 0,
      compromise: 0
    },
    sharedDefinedCenters: ["throat"],
    bridgedCenters: ["ajna"],
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-compatibility-input.v1",
      value: digest("e")
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: digest("f")
    }
  };
}

function validTransitResult() {
  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-transit-result.v1",
    mode: "transit",
    natal: validResult(),
    transitSnapshot: {
      instant: "2026-07-23T09:30:00.000Z",
      date: "2026-07-23",
      time: "12:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    },
    transitActivations: completeTransitActivations([
      { side: "transit", body: "sun", longitude: 57.25, gate: 23, line: 1 }
    ]),
    transitDefinedGates: [
      {
        gate: 23,
        activatedBy: [{ body: "sun", line: 1 }]
      }
    ],
    completedChannels: [
      {
        code: "43-23",
        gates: [43, 23],
        centers: ["ajna", "throat"],
        circuit: "individual",
        natalGate: 43,
        transitGate: 23
      }
    ],
    temporarilyDefinedCenters: [
      {
        code: "ajna",
        definedByCompletedChannels: ["43-23"]
      }
    ],
    summary: {
      transitActivationCount: 13,
      completedChannelCount: 1,
      temporarilyDefinedCenterCount: 1
    },
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-transit-input.v1",
      value: digest("a")
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: digest("b")
    }
  };
}

function completeActivations(
  overrides: readonly {
    readonly side: "personality" | "design";
    readonly body:
      | "sun"
      | "earth"
      | "moon"
      | "north_node"
      | "south_node"
      | "mercury"
      | "venus"
      | "mars"
      | "jupiter"
      | "saturn"
      | "uranus"
      | "neptune"
      | "pluto";
    readonly longitude: number;
    readonly gate: number;
    readonly line: number;
  }[]
) {
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
  const activationMap = new Map(
    overrides.map((activation) => [`${activation.side}.${activation.body}`, activation])
  );
  return (["personality", "design"] as const).flatMap((side, sideIndex) =>
    bodies.map((body, bodyIndex) => {
      const key = `${side}.${body}`;
      return (
        activationMap.get(key) ?? {
          side,
          body,
          longitude: (bodyIndex * 10 + sideIndex) % 360,
          gate: (bodyIndex + sideIndex + 1),
          line: ((bodyIndex + sideIndex) % 6) + 1
        }
      );
    })
  );
}

function completeTransitActivations(
  overrides: readonly {
    readonly side: "transit";
    readonly body:
      | "sun"
      | "earth"
      | "moon"
      | "north_node"
      | "south_node"
      | "mercury"
      | "venus"
      | "mars"
      | "jupiter"
      | "saturn"
      | "uranus"
      | "neptune"
      | "pluto";
    readonly longitude: number;
    readonly gate: number;
    readonly line: number;
  }[]
) {
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
  const activationMap = new Map(overrides.map((activation) => [activation.body, activation]));
  return bodies.map((body, bodyIndex) => {
    return (
      activationMap.get(body) ?? {
        side: "transit",
        body,
        longitude: (bodyIndex * 10) % 360,
        gate: bodyIndex + 1,
        line: (bodyIndex % 6) + 1
      }
    );
  });
}
