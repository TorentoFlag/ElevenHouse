import { createHash } from "node:crypto";
import { HUMAN_DESIGN_CENTERS, HUMAN_DESIGN_CHANNELS, type HumanDesignCircuit } from "./catalog";
import type { HumanDesignDefinedCenter } from "./definition";
import { mapLongitudeToHumanDesignGateLine, normalizeHumanDesignLongitude } from "./gate-wheel";
import {
  HUMAN_DESIGN_ACTIVE_BODIES,
  HUMAN_DESIGN_ENGINE_REVISION,
  HUMAN_DESIGN_METHOD_CODE,
  type HumanDesignCelestialBody,
  type HumanDesignCenterCode,
  type HumanDesignChannelCode,
  type HumanDesignGateNumber,
  type HumanDesignLineNumber
} from "./human-design-types";
import type { HumanDesignBasePlanetaryLongitudes } from "./activations";
import type { HumanDesignIndividualBaseResult } from "./individual";
import {
  canonicalizeHumanDesignChecksumPayload,
  createHumanDesignResultChecksum,
  type HumanDesignResultChecksum
} from "./result-checksum";

export const HUMAN_DESIGN_TRANSIT_SCHEMA_VERSION = "human-design-transit-result.v1" as const;

export type HumanDesignTransitSnapshot = {
  readonly instant: string;
  readonly date: string;
  readonly time: string;
  readonly timezone: string;
  readonly latitude: number;
  readonly longitude: number;
};

export type HumanDesignTransitActivation = {
  readonly side: "transit";
  readonly body: HumanDesignCelestialBody;
  readonly longitude: number;
  readonly gate: HumanDesignGateNumber;
  readonly line: HumanDesignLineNumber;
};

export type HumanDesignTransitDefinedGate = {
  readonly gate: HumanDesignGateNumber;
  readonly activatedBy: readonly {
    readonly body: HumanDesignCelestialBody;
    readonly line: HumanDesignLineNumber;
  }[];
};

export type HumanDesignTransitCompletedChannel = {
  readonly code: HumanDesignChannelCode;
  readonly gates: readonly [HumanDesignGateNumber, HumanDesignGateNumber];
  readonly centers: readonly [HumanDesignCenterCode, HumanDesignCenterCode];
  readonly circuit: HumanDesignCircuit;
  readonly natalGate: HumanDesignGateNumber;
  readonly transitGate: HumanDesignGateNumber;
};

export type HumanDesignTransitTemporaryCenter = {
  readonly code: HumanDesignCenterCode;
  readonly definedByCompletedChannels: readonly HumanDesignChannelCode[];
};

export type HumanDesignTransitInputFingerprint = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly scope: "human-design-transit-input.v1";
  readonly value: `sha256:${string}`;
};

export type HumanDesignTransitResult = {
  readonly methodCode: typeof HUMAN_DESIGN_METHOD_CODE;
  readonly engineRevision: typeof HUMAN_DESIGN_ENGINE_REVISION;
  readonly schemaVersion: typeof HUMAN_DESIGN_TRANSIT_SCHEMA_VERSION;
  readonly mode: "transit";
  readonly natal: HumanDesignIndividualBaseResult;
  readonly transitSnapshot: HumanDesignTransitSnapshot;
  readonly transitActivations: readonly HumanDesignTransitActivation[];
  readonly transitDefinedGates: readonly HumanDesignTransitDefinedGate[];
  readonly completedChannels: readonly HumanDesignTransitCompletedChannel[];
  readonly temporarilyDefinedCenters: readonly HumanDesignTransitTemporaryCenter[];
  readonly summary: {
    readonly transitActivationCount: number;
    readonly completedChannelCount: number;
    readonly temporarilyDefinedCenterCount: number;
  };
  readonly inputFingerprint: HumanDesignTransitInputFingerprint;
  readonly resultChecksum: HumanDesignResultChecksum;
};

type HumanDesignTransitResultWithoutChecksum = Omit<HumanDesignTransitResult, "resultChecksum">;

export function buildHumanDesignTransitResult(input: {
  readonly natal: HumanDesignIndividualBaseResult;
  readonly transit: HumanDesignBasePlanetaryLongitudes;
  readonly transitSnapshot: HumanDesignTransitSnapshot;
}): HumanDesignTransitResult {
  const transitActivations = buildTransitActivations(input.transit);
  const transitDefinedGates = buildTransitDefinedGates(transitActivations);
  const completedChannels = deriveTransitCompletedChannels({
    natal: input.natal,
    transitActivations
  });
  const temporarilyDefinedCenters = deriveTemporarilyDefinedCenters({
    natalDefinedCenters: input.natal.definedCenters,
    completedChannels
  });
  const resultWithoutChecksum: HumanDesignTransitResultWithoutChecksum = {
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
    schemaVersion: HUMAN_DESIGN_TRANSIT_SCHEMA_VERSION,
    mode: "transit",
    natal: input.natal,
    transitSnapshot: input.transitSnapshot,
    transitActivations,
    transitDefinedGates,
    completedChannels,
    temporarilyDefinedCenters,
    summary: {
      transitActivationCount: transitActivations.length,
      completedChannelCount: completedChannels.length,
      temporarilyDefinedCenterCount: temporarilyDefinedCenters.length
    },
    inputFingerprint: createHumanDesignTransitInputFingerprint(input)
  };

  return {
    ...resultWithoutChecksum,
    resultChecksum: createHumanDesignResultChecksum(resultWithoutChecksum)
  };
}

export function createHumanDesignTransitInputFingerprint(input: {
  readonly natal: Pick<HumanDesignIndividualBaseResult, "resultChecksum">;
  readonly transit: HumanDesignBasePlanetaryLongitudes;
  readonly transitSnapshot: HumanDesignTransitSnapshot;
}): HumanDesignTransitInputFingerprint {
  const canonicalPayload = canonicalizeHumanDesignChecksumPayload({
    scope: "human-design-transit-input.v1",
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
    schemaVersion: HUMAN_DESIGN_TRANSIT_SCHEMA_VERSION,
    mode: "transit",
    natalResultChecksum: input.natal.resultChecksum.value,
    transitSnapshot: input.transitSnapshot,
    transitLongitudes: input.transit
  });
  const digest = createHash("sha256").update(canonicalPayload).digest("hex");
  return {
    algorithm: "sha256",
    canonicalization: "json-stable-v1",
    scope: "human-design-transit-input.v1",
    value: `sha256:${digest}`
  };
}

function buildTransitActivations(
  input: HumanDesignBasePlanetaryLongitudes
): readonly HumanDesignTransitActivation[] {
  return HUMAN_DESIGN_ACTIVE_BODIES.map((body) => buildTransitActivation(body, input));
}

function buildTransitActivation(
  body: HumanDesignCelestialBody,
  input: HumanDesignBasePlanetaryLongitudes
): HumanDesignTransitActivation {
  const longitude = resolveTransitBodyLongitude(body, input);
  const gateLine = mapLongitudeToHumanDesignGateLine(longitude);
  return {
    side: "transit",
    body,
    longitude: gateLine.normalizedLongitude,
    gate: gateLine.gate,
    line: gateLine.line
  };
}

function resolveTransitBodyLongitude(
  body: HumanDesignCelestialBody,
  input: HumanDesignBasePlanetaryLongitudes
): number {
  if (body === "earth") return normalizeHumanDesignLongitude(input.sun + 180);
  if (body === "south_node") return normalizeHumanDesignLongitude(input.north_node + 180);
  return input[body];
}

function buildTransitDefinedGates(
  activations: readonly HumanDesignTransitActivation[]
): readonly HumanDesignTransitDefinedGate[] {
  const gates = new Map<HumanDesignGateNumber, HumanDesignTransitDefinedGate["activatedBy"]>();
  for (const activation of activations) {
    const activatedBy = gates.get(activation.gate) ?? [];
    gates.set(activation.gate, [
      ...activatedBy,
      { body: activation.body, line: activation.line }
    ]);
  }
  return [...gates.entries()]
    .sort(([firstGate], [secondGate]) => firstGate - secondGate)
    .map(([gate, activatedBy]) => ({ gate, activatedBy }));
}

function deriveTransitCompletedChannels(input: {
  readonly natal: HumanDesignIndividualBaseResult;
  readonly transitActivations: readonly HumanDesignTransitActivation[];
}): readonly HumanDesignTransitCompletedChannel[] {
  const natalDefinedChannels = new Set(input.natal.definedChannels.map((channel) => channel.code));
  const natalGates = new Set(input.natal.definedGates.map((gate) => gate.gate));
  const transitGates = new Set(input.transitActivations.map((activation) => activation.gate));

  return HUMAN_DESIGN_CHANNELS.flatMap((channel) => {
    if (natalDefinedChannels.has(channel.code)) return [];
    const gateANatal = natalGates.has(channel.gateA);
    const gateBNatal = natalGates.has(channel.gateB);
    const gateATransit = transitGates.has(channel.gateA);
    const gateBTransit = transitGates.has(channel.gateB);

    if (gateANatal && gateBTransit) {
      return [
        {
          code: channel.code,
          gates: [channel.gateA, channel.gateB],
          centers: [channel.centerA, channel.centerB],
          circuit: channel.circuit,
          natalGate: channel.gateA,
          transitGate: channel.gateB
        }
      ];
    }
    if (gateBNatal && gateATransit) {
      return [
        {
          code: channel.code,
          gates: [channel.gateA, channel.gateB],
          centers: [channel.centerA, channel.centerB],
          circuit: channel.circuit,
          natalGate: channel.gateB,
          transitGate: channel.gateA
        }
      ];
    }
    return [];
  });
}

function deriveTemporarilyDefinedCenters(input: {
  readonly natalDefinedCenters: readonly HumanDesignDefinedCenter[];
  readonly completedChannels: readonly HumanDesignTransitCompletedChannel[];
}): readonly HumanDesignTransitTemporaryCenter[] {
  const natalCenters = new Set(input.natalDefinedCenters.map((center) => center.code));
  return HUMAN_DESIGN_CENTERS.flatMap((center) => {
    if (natalCenters.has(center.code)) return [];
    const definedByCompletedChannels = input.completedChannels
      .filter((channel) => channel.centers.includes(center.code))
      .map((channel) => channel.code);
    if (definedByCompletedChannels.length === 0) return [];
    return [{ code: center.code, definedByCompletedChannels }];
  });
}
