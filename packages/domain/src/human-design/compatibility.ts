import { createHash } from "node:crypto";
import {
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  type HumanDesignCircuit
} from "./catalog";
import type { HumanDesignDefinedCenter } from "./definition";
import {
  HUMAN_DESIGN_ENGINE_REVISION,
  HUMAN_DESIGN_METHOD_CODE,
  type HumanDesignCenterCode,
  type HumanDesignChannelCode,
  type HumanDesignGateNumber
} from "./human-design-types";
import type { HumanDesignIndividualBaseResult } from "./individual";
import {
  canonicalizeHumanDesignChecksumPayload,
  createHumanDesignResultChecksum,
  type HumanDesignResultChecksum
} from "./result-checksum";

export const HUMAN_DESIGN_COMPATIBILITY_SCHEMA_VERSION =
  "human-design-compatibility-result.v1" as const;

export type HumanDesignConnectionDynamicCode =
  | "electromagnetic"
  | "companionship"
  | "dominance"
  | "compromise";

export type HumanDesignConnectionGateState = "none" | "hanging" | "full";

export type HumanDesignCompatibilityInputFingerprint = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly scope: "human-design-compatibility-input.v1";
  readonly value: `sha256:${string}`;
};

export type HumanDesignConnectionChannel = {
  readonly code: HumanDesignChannelCode;
  readonly gates: readonly [HumanDesignGateNumber, HumanDesignGateNumber];
  readonly centers: readonly [HumanDesignCenterCode, HumanDesignCenterCode];
  readonly circuit: HumanDesignCircuit;
  readonly dynamic: HumanDesignConnectionDynamicCode;
  readonly subjectGateState: HumanDesignConnectionGateState;
  readonly partnerGateState: HumanDesignConnectionGateState;
};

export type HumanDesignCompatibilityResult = {
  readonly methodCode: typeof HUMAN_DESIGN_METHOD_CODE;
  readonly engineRevision: typeof HUMAN_DESIGN_ENGINE_REVISION;
  readonly schemaVersion: typeof HUMAN_DESIGN_COMPATIBILITY_SCHEMA_VERSION;
  readonly mode: "compatibility";
  readonly participants: {
    readonly subject: HumanDesignIndividualBaseResult;
    readonly partner: HumanDesignIndividualBaseResult;
  };
  readonly connectionChannels: readonly HumanDesignConnectionChannel[];
  readonly dynamicCounts: Record<HumanDesignConnectionDynamicCode, number>;
  readonly sharedDefinedCenters: readonly HumanDesignCenterCode[];
  readonly bridgedCenters: readonly HumanDesignCenterCode[];
  readonly inputFingerprint: HumanDesignCompatibilityInputFingerprint;
  readonly resultChecksum: HumanDesignResultChecksum;
};

type HumanDesignCompatibilityResultWithoutChecksum = Omit<
  HumanDesignCompatibilityResult,
  "resultChecksum"
>;

export function buildHumanDesignCompatibilityResult(input: {
  readonly subject: HumanDesignIndividualBaseResult;
  readonly partner: HumanDesignIndividualBaseResult;
}): HumanDesignCompatibilityResult {
  const connectionChannels = HUMAN_DESIGN_CHANNELS.flatMap((channel) =>
    classifyConnectionChannel(channel, input.subject, input.partner)
  );
  const resultWithoutChecksum: HumanDesignCompatibilityResultWithoutChecksum = {
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
    schemaVersion: HUMAN_DESIGN_COMPATIBILITY_SCHEMA_VERSION,
    mode: "compatibility",
    participants: {
      subject: input.subject,
      partner: input.partner
    },
    connectionChannels,
    dynamicCounts: countConnectionDynamics(connectionChannels),
    sharedDefinedCenters: intersectDefinedCenters(input.subject, input.partner),
    bridgedCenters: deriveBridgedCenters(connectionChannels, input.subject, input.partner),
    inputFingerprint: createHumanDesignCompatibilityInputFingerprint(input)
  };

  return {
    ...resultWithoutChecksum,
    resultChecksum: createHumanDesignResultChecksum(resultWithoutChecksum)
  };
}

export function createHumanDesignCompatibilityInputFingerprint(input: {
  readonly subject: Pick<HumanDesignIndividualBaseResult, "inputFingerprint">;
  readonly partner: Pick<HumanDesignIndividualBaseResult, "inputFingerprint">;
}): HumanDesignCompatibilityInputFingerprint {
  const canonicalPayload = canonicalizeHumanDesignChecksumPayload({
    scope: "human-design-compatibility-input.v1",
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
    schemaVersion: HUMAN_DESIGN_COMPATIBILITY_SCHEMA_VERSION,
    mode: "compatibility",
    subjectInputFingerprint: input.subject.inputFingerprint.value,
    partnerInputFingerprint: input.partner.inputFingerprint.value
  });
  const digest = createHash("sha256").update(canonicalPayload).digest("hex");
  return {
    algorithm: "sha256",
    canonicalization: "json-stable-v1",
    scope: "human-design-compatibility-input.v1",
    value: `sha256:${digest}`
  };
}

function classifyConnectionChannel(
  channel: (typeof HUMAN_DESIGN_CHANNELS)[number],
  subject: HumanDesignIndividualBaseResult,
  partner: HumanDesignIndividualBaseResult
): readonly HumanDesignConnectionChannel[] {
  const subjectGateState = channelGateState(channel.code, channel.gateA, channel.gateB, subject);
  const partnerGateState = channelGateState(channel.code, channel.gateA, channel.gateB, partner);
  const dynamic = classifyDynamic({
    subjectGateState,
    partnerGateState,
    subjectGates: activeChannelGates(channel, subject),
    partnerGates: activeChannelGates(channel, partner)
  });
  if (!dynamic) return [];
  return [
    {
      code: channel.code,
      gates: [channel.gateA, channel.gateB],
      centers: [channel.centerA, channel.centerB],
      circuit: channel.circuit,
      dynamic,
      subjectGateState,
      partnerGateState
    }
  ];
}

function classifyDynamic(input: {
  readonly subjectGateState: HumanDesignConnectionGateState;
  readonly partnerGateState: HumanDesignConnectionGateState;
  readonly subjectGates: ReadonlySet<HumanDesignGateNumber>;
  readonly partnerGates: ReadonlySet<HumanDesignGateNumber>;
}): HumanDesignConnectionDynamicCode | null {
  if (input.subjectGateState === "full" && input.partnerGateState === "full") {
    return "companionship";
  }
  if (
    (input.subjectGateState === "full" && input.partnerGateState === "hanging") ||
    (input.subjectGateState === "hanging" && input.partnerGateState === "full")
  ) {
    return "compromise";
  }
  if (
    (input.subjectGateState === "full" && input.partnerGateState === "none") ||
    (input.subjectGateState === "none" && input.partnerGateState === "full")
  ) {
    return "dominance";
  }
  if (
    input.subjectGateState === "hanging" &&
    input.partnerGateState === "hanging" &&
    !setsOverlap(input.subjectGates, input.partnerGates)
  ) {
    return "electromagnetic";
  }
  return null;
}

function channelGateState(
  channelCode: HumanDesignChannelCode,
  gateA: HumanDesignGateNumber,
  gateB: HumanDesignGateNumber,
  result: HumanDesignIndividualBaseResult
): HumanDesignConnectionGateState {
  if (result.definedChannels.some((channel) => channel.code === channelCode)) return "full";
  const activeGates = result.definedGates.filter(
    (gate) => gate.gate === gateA || gate.gate === gateB
  );
  if (activeGates.length === 0) return "none";
  return "hanging";
}

function activeChannelGates(
  channel: (typeof HUMAN_DESIGN_CHANNELS)[number],
  result: HumanDesignIndividualBaseResult
): ReadonlySet<HumanDesignGateNumber> {
  return new Set(
    result.definedGates
      .map((definedGate) => definedGate.gate)
      .filter((gate) => gate === channel.gateA || gate === channel.gateB)
  );
}

function countConnectionDynamics(
  channels: readonly HumanDesignConnectionChannel[]
): Record<HumanDesignConnectionDynamicCode, number> {
  return {
    electromagnetic: countByDynamic(channels, "electromagnetic"),
    companionship: countByDynamic(channels, "companionship"),
    dominance: countByDynamic(channels, "dominance"),
    compromise: countByDynamic(channels, "compromise")
  };
}

function countByDynamic(
  channels: readonly HumanDesignConnectionChannel[],
  dynamic: HumanDesignConnectionDynamicCode
): number {
  return channels.filter((channel) => channel.dynamic === dynamic).length;
}

function intersectDefinedCenters(
  subject: HumanDesignIndividualBaseResult,
  partner: HumanDesignIndividualBaseResult
): readonly HumanDesignCenterCode[] {
  const subjectCenters = centerSet(subject.definedCenters);
  const partnerCenters = centerSet(partner.definedCenters);
  return HUMAN_DESIGN_CENTERS.flatMap((center) =>
    subjectCenters.has(center.code) && partnerCenters.has(center.code) ? [center.code] : []
  );
}

function deriveBridgedCenters(
  channels: readonly HumanDesignConnectionChannel[],
  subject: HumanDesignIndividualBaseResult,
  partner: HumanDesignIndividualBaseResult
): readonly HumanDesignCenterCode[] {
  const subjectCenters = centerSet(subject.definedCenters);
  const partnerCenters = centerSet(partner.definedCenters);
  const bridged = new Set<HumanDesignCenterCode>();
  for (const channel of channels) {
    if (channel.dynamic !== "electromagnetic") continue;
    for (const center of channel.centers) {
      if (!(subjectCenters.has(center) && partnerCenters.has(center))) {
        bridged.add(center);
      }
    }
  }
  return HUMAN_DESIGN_CENTERS.flatMap((center) => (bridged.has(center.code) ? [center.code] : []));
}

function centerSet(centers: readonly HumanDesignDefinedCenter[]): ReadonlySet<HumanDesignCenterCode> {
  return new Set(centers.map((center) => center.code));
}

function setsOverlap<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  for (const item of left) {
    if (right.has(item)) return true;
  }
  return false;
}
