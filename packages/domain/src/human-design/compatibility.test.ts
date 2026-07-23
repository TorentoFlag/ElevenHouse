import { describe, expect, it } from "vitest";
import type { HumanDesignDefinedCenter, HumanDesignDefinedChannel } from "./definition";
import { buildHumanDesignCompatibilityResult } from "./compatibility";
import type { HumanDesignIndividualBaseResult } from "./individual";
import type {
  HumanDesignActivation,
  HumanDesignChannelCode,
  HumanDesignGateNumber,
  HumanDesignLineNumber
} from "./human-design-types";

describe("Human Design compatibility mechanics", () => {
  it("classifies electromagnetic, companionship, dominance and compromise channels", () => {
    const result = buildHumanDesignCompatibilityResult({
      subject: individualWithMechanics({
        inputFingerprint: digest("a"),
        channels: [
          channel("31-7", [31, 7], ["throat", "g"]),
          channel("30-41", [30, 41], ["solar_plexus", "root"])
        ],
        extraGates: [43]
      }),
      partner: individualWithMechanics({
        inputFingerprint: digest("b"),
        channels: [
          channel("31-7", [31, 7], ["throat", "g"]),
          channel("20-10", [20, 10], ["throat", "g"])
        ],
        extraGates: [23, 41]
      })
    });

    expect(result).toMatchObject({
      methodCode: "human_design_classic",
      engineRevision: 1,
      schemaVersion: "human-design-compatibility-result.v1",
      mode: "compatibility",
      inputFingerprint: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1",
        scope: "human-design-compatibility-input.v1"
      },
      resultChecksum: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1"
      },
      dynamicCounts: {
        electromagnetic: 1,
        companionship: 1,
        dominance: 1,
        compromise: 1
      }
    });
    expect(result.inputFingerprint.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.resultChecksum.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.connectionChannels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "43-23",
          dynamic: "electromagnetic",
          subjectGateState: "hanging",
          partnerGateState: "hanging"
        }),
        expect.objectContaining({
          code: "31-7",
          dynamic: "companionship",
          subjectGateState: "full",
          partnerGateState: "full"
        }),
        expect.objectContaining({
          code: "20-10",
          dynamic: "dominance",
          subjectGateState: "none",
          partnerGateState: "full"
        }),
        expect.objectContaining({
          code: "30-41",
          dynamic: "compromise",
          subjectGateState: "full",
          partnerGateState: "hanging"
        })
      ])
    );
    expect(result.sharedDefinedCenters).toEqual(["throat", "g"]);
    expect(result.bridgedCenters).toEqual(["ajna"]);
  });

  it("keeps subject and partner fingerprint order stable", () => {
    const subject = individualWithMechanics({
      inputFingerprint: digest("a"),
      channels: [channel("31-7", [31, 7], ["throat", "g"])]
    });
    const partner = individualWithMechanics({
      inputFingerprint: digest("b"),
      channels: [channel("43-23", [43, 23], ["ajna", "throat"])]
    });

    const result = buildHumanDesignCompatibilityResult({ subject, partner });
    const reversed = buildHumanDesignCompatibilityResult({ subject: partner, partner: subject });

    expect(result.inputFingerprint.value).not.toBe(reversed.inputFingerprint.value);
  });
});

function individualWithMechanics(input: {
  readonly inputFingerprint: `sha256:${string}`;
  readonly channels: readonly HumanDesignDefinedChannel[];
  readonly extraGates?: readonly HumanDesignGateNumber[];
}): HumanDesignIndividualBaseResult {
  const channelGates = input.channels.flatMap((definedChannel) => definedChannel.gates);
  const activeGates = uniqueNumbers([...channelGates, ...(input.extraGates ?? [])]);
  const activations = activeGates.map((gate, index) => activation(gate, index));
  const definedCenters = centersFromChannels(input.channels);
  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-result.v1",
    mode: "individual",
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-individual-resolved-input.v1",
      value: input.inputFingerprint
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: digest("c")
    },
    activations,
    definedGates: activeGates.map((gate, index) => ({
      gate,
      activatedBy: [{ side: "personality", body: "sun", line: lineFromIndex(index) }]
    })),
    definedChannels: input.channels,
    definedCenters,
    type: "projector",
    strategy: "wait_for_invitation",
    signature: "success",
    notSelfTheme: "bitterness",
    typeBasis: {
      definedCenterCount: definedCenters.length,
      sacralDefined: definedCenters.some((center) => center.code === "sacral"),
      throatDefined: definedCenters.some((center) => center.code === "throat"),
      throatConnectedMotorCenters: []
    },
    authority: "splenic",
    authorityBasis: {
      definedCenters: definedCenters.map((center) => center.code),
      priority: ["splenic"],
      selectedBy: "splenic_defined"
    },
    definition: "single",
    definitionComponents: [
      {
        centers: definedCenters.map((center) => center.code),
        channels: input.channels.map((definedChannel) => definedChannel.code)
      }
    ],
    definitionBasis: {
      definedCenterCount: definedCenters.length,
      componentCount: definedCenters.length === 0 ? 0 : 1
    },
    incarnationCross: {
      angle: "right_angle",
      profileCode: "1/3",
      gates: {
        personalitySun: { gate: 41, line: 1 },
        personalityEarth: { gate: 31, line: 1 },
        designSun: { gate: 43, line: 1 },
        designEarth: { gate: 23, line: 1 }
      },
      gateSequence: [41, 31, 43, 23]
    },
    profile: { personalityLine: 1, designLine: 3, code: "1/3" }
  };
}

function channel(
  code: HumanDesignChannelCode,
  gates: readonly [HumanDesignGateNumber, HumanDesignGateNumber],
  centers: HumanDesignDefinedChannel["centers"]
): HumanDesignDefinedChannel {
  return { code, gates, centers, circuit: "collective" };
}

function centersFromChannels(
  channels: readonly HumanDesignDefinedChannel[]
): readonly HumanDesignDefinedCenter[] {
  const centerMap = new Map<HumanDesignDefinedCenter["code"], HumanDesignChannelCode[]>();
  for (const definedChannel of channels) {
    for (const center of definedChannel.centers) {
      centerMap.set(center, [...(centerMap.get(center) ?? []), definedChannel.code]);
    }
  }
  return [...centerMap.entries()].map(([code, definedByChannels]) => ({
    code,
    definedByChannels
  }));
}

function activation(gate: HumanDesignGateNumber, index: number): HumanDesignActivation {
  return {
    side: "personality",
    body: "sun",
    longitude: gate,
    gate,
    line: lineFromIndex(index)
  };
}

function uniqueNumbers<T extends number>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function lineFromIndex(index: number): HumanDesignLineNumber {
  return ((index % 6) + 1) as HumanDesignLineNumber;
}

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
