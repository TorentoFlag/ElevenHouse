import { describe, expect, it } from "vitest";
import type { HumanDesignBasePlanetaryLongitudes } from "./activations";
import { buildHumanDesignIndividualBaseResult } from "./individual";

const longitudes = (
  overrides: Partial<HumanDesignBasePlanetaryLongitudes> = {}
): HumanDesignBasePlanetaryLongitudes => ({
  sun: 302,
  moon: 307.625,
  north_node: 60.125,
  mercury: 240.125,
  venus: 10,
  mars: 20,
  jupiter: 30,
  saturn: 40,
  uranus: 50,
  neptune: 60,
  pluto: 70,
  ...overrides
});

describe("Human Design individual base result", () => {
  it("assembles deterministic mechanics from personality and design longitudes", () => {
    const result = buildHumanDesignIndividualBaseResult({
      personality: longitudes({ sun: 302, moon: 60.125, north_node: 10, mercury: 240.125 }),
      design: longitudes({ sun: 242, north_node: 10, mercury: 10 })
    });

    expect(result).toMatchObject({
      methodCode: "human_design_classic",
      engineRevision: 1,
      schemaVersion: "human-design-result.v1",
      mode: "individual",
      inputFingerprint: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1",
        scope: "human-design-individual-resolved-input.v1"
      },
      resultChecksum: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1"
      },
      type: "manifesting_generator",
      strategy: "wait_to_respond",
      signature: "satisfaction",
      notSelfTheme: "frustration",
      authority: "sacral",
      definition: "single",
      profile: { personalityLine: 1, designLine: 3, code: "1/3" },
      incarnationCross: {
        angle: "right_angle",
        profileCode: "1/3",
        gates: {
          personalitySun: { gate: 41, line: 1 },
          designSun: { gate: 34, line: 3 }
        }
      },
      authorityBasis: {
        selectedBy: "sacral_defined"
      },
      definitionBasis: {
        componentCount: 1
      },
      typeBasis: {
        sacralDefined: true,
        throatDefined: true,
        throatConnectedMotorCenters: ["sacral"]
      }
    });
    expect(result.inputFingerprint.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.resultChecksum.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.activations).toHaveLength(26);
    expect(result.definedChannels).toContainEqual({
      code: "20-34",
      gates: [20, 34],
      centers: ["throat", "sacral"],
      circuit: "integration"
    });
    expect(result.definedCenters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "throat", definedByChannels: expect.arrayContaining(["20-34"]) }),
        expect.objectContaining({ code: "sacral", definedByChannels: expect.arrayContaining(["20-34"]) })
      ])
    );
    expect(result.definedGates.find((gate) => gate.gate === 34)).toEqual({
      gate: 34,
      activatedBy: [
        { side: "personality", body: "mercury", line: 1 },
        { side: "design", body: "sun", line: 3 }
      ]
    });
  });
});
