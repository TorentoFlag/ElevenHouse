import { describe, expect, it } from "vitest";
import {
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema
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
