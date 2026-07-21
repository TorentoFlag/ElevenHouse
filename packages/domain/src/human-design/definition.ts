import { HUMAN_DESIGN_CENTERS, HUMAN_DESIGN_CHANNELS, type HumanDesignCircuit } from "./catalog";
import type {
  HumanDesignActivation,
  HumanDesignCenterCode,
  HumanDesignChannelCode,
  HumanDesignGateNumber
} from "./human-design-types";

export type HumanDesignDefinedChannel = {
  readonly code: HumanDesignChannelCode;
  readonly gates: readonly [HumanDesignGateNumber, HumanDesignGateNumber];
  readonly centers: readonly [HumanDesignCenterCode, HumanDesignCenterCode];
  readonly circuit: HumanDesignCircuit;
};

export type HumanDesignDefinedCenter = {
  readonly code: HumanDesignCenterCode;
  readonly definedByChannels: readonly HumanDesignChannelCode[];
};

export function deriveDefinedChannels(
  activations: readonly HumanDesignActivation[]
): readonly HumanDesignDefinedChannel[] {
  const activeGates = new Set(activations.map((activation) => activation.gate));
  return HUMAN_DESIGN_CHANNELS.filter(
    (channel) => activeGates.has(channel.gateA) && activeGates.has(channel.gateB)
  ).map((channel) => ({
    code: channel.code,
    gates: [channel.gateA, channel.gateB],
    centers: [channel.centerA, channel.centerB],
    circuit: channel.circuit
  }));
}

export function deriveDefinedCenters(
  channels: readonly HumanDesignDefinedChannel[]
): readonly HumanDesignDefinedCenter[] {
  return HUMAN_DESIGN_CENTERS.flatMap((center) => {
    const definedByChannels = channels
      .filter((channel) => channel.centers.includes(center.code))
      .map((channel) => channel.code);
    if (definedByChannels.length === 0) return [];
    return [{ code: center.code, definedByChannels }];
  });
}
