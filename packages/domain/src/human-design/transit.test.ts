import { describe, expect, it } from "vitest";
import type { HumanDesignDefinedCenter, HumanDesignDefinedChannel } from "./definition";
import {
  HUMAN_DESIGN_GATE_SPAN_DEGREES,
  HUMAN_DESIGN_GATE_WHEEL_SEQUENCE,
  HUMAN_DESIGN_GATE_41_START_LONGITUDE,
  normalizeHumanDesignLongitude
} from "./gate-wheel";
import type {
  HumanDesignActivation,
  HumanDesignChannelCode,
  HumanDesignGateNumber,
  HumanDesignLineNumber
} from "./human-design-types";
import { buildHumanDesignTransitResult } from "./transit";
import type { HumanDesignIndividualBaseResult } from "./individual";

describe("Human Design transit overlay mechanics", () => {
  it("builds transit-only activations and completed channels against natal gates", () => {
    const natal = individualWithMechanics({
      inputFingerprint: digest("a"),
      channels: [channel("31-7", [31, 7], ["throat", "g"])],
      extraGates: [43]
    });

    const result = buildHumanDesignTransitResult({
      natal,
      transit: longitudesForGates([23, 11, 19, 52, 42, 55, 30, 41, 39, 60, 61]),
      transitSnapshot: {
        instant: "2026-07-23T09:30:00.000Z",
        date: "2026-07-23",
        time: "12:30",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      }
    });

    expect(result).toMatchObject({
      methodCode: "human_design_classic",
      engineRevision: 1,
      schemaVersion: "human-design-transit-result.v1",
      mode: "transit",
      inputFingerprint: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1",
        scope: "human-design-transit-input.v1"
      },
      resultChecksum: {
        algorithm: "sha256",
        canonicalization: "json-stable-v1"
      },
      summary: {
        transitActivationCount: 13,
        completedChannelCount: 1,
        temporarilyDefinedCenterCount: 1
      }
    });
    expect(result.transitActivations).toHaveLength(13);
    expect(new Set(result.transitActivations.map((activation) => activation.side))).toEqual(
      new Set(["transit"])
    );
    expect(result.completedChannels).toEqual([
      expect.objectContaining({
        code: "43-23",
        natalGate: 43,
        transitGate: 23,
        centers: ["ajna", "throat"]
      })
    ]);
    expect(result.temporarilyDefinedCenters).toEqual([
      {
        code: "ajna",
        definedByCompletedChannels: ["43-23"]
      }
    ]);
    expect(result.inputFingerprint.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.resultChecksum.value).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps the transit fingerprint stable for the same natal checksum and selected instant", () => {
    const natal = individualWithMechanics({
      inputFingerprint: digest("a"),
      channels: [channel("31-7", [31, 7], ["throat", "g"])],
      extraGates: [43]
    });
    const input = {
      natal,
      transit: longitudesForGates([23, 11, 19, 52, 42, 55, 30, 41, 39, 60, 61]),
      transitSnapshot: {
        instant: "2026-07-23T09:30:00.000Z",
        date: "2026-07-23",
        time: "12:30",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      }
    };

    expect(buildHumanDesignTransitResult(input).inputFingerprint.value).toBe(
      buildHumanDesignTransitResult(input).inputFingerprint.value
    );
  });
});

function longitudesForGates(
  gates: readonly HumanDesignGateNumber[]
): HumanDesignIndividualBaseResult["activations"] extends readonly unknown[]
  ? {
      readonly sun: number;
      readonly moon: number;
      readonly north_node: number;
      readonly mercury: number;
      readonly venus: number;
      readonly mars: number;
      readonly jupiter: number;
      readonly saturn: number;
      readonly uranus: number;
      readonly neptune: number;
      readonly pluto: number;
    }
  : never {
  const [sun, moon, northNode, mercury, venus, mars, jupiter, saturn, uranus, neptune, pluto] =
    gates.map(longitudeForGate);
  return {
    sun: sun!,
    moon: moon!,
    north_node: northNode!,
    mercury: mercury!,
    venus: venus!,
    mars: mars!,
    jupiter: jupiter!,
    saturn: saturn!,
    uranus: uranus!,
    neptune: neptune!,
    pluto: pluto!
  };
}

function longitudeForGate(gate: HumanDesignGateNumber): number {
  const index = HUMAN_DESIGN_GATE_WHEEL_SEQUENCE.indexOf(gate);
  if (index < 0) throw new Error(`Missing gate in wheel: ${gate}`);
  return normalizeHumanDesignLongitude(
    HUMAN_DESIGN_GATE_41_START_LONGITUDE + index * HUMAN_DESIGN_GATE_SPAN_DEGREES + 1
  );
}

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
