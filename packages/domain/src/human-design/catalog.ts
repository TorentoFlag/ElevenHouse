import {
  HUMAN_DESIGN_CENTER_CODES,
  type HumanDesignCenterCode,
  type HumanDesignChannelCode,
  type HumanDesignGateNumber
} from "./human-design-types";

export type HumanDesignCircuit = "individual" | "collective" | "tribal" | "integration";

export type HumanDesignCenterDefinition = {
  readonly code: HumanDesignCenterCode;
};

export type HumanDesignChannelDefinition = {
  readonly code: HumanDesignChannelCode;
  readonly gateA: HumanDesignGateNumber;
  readonly gateB: HumanDesignGateNumber;
  readonly centerA: HumanDesignCenterCode;
  readonly centerB: HumanDesignCenterCode;
  readonly circuit: HumanDesignCircuit;
};

export const HUMAN_DESIGN_CENTERS = HUMAN_DESIGN_CENTER_CODES.map((code) => ({ code }));

export const HUMAN_DESIGN_CHANNELS = [
  channel("64-47", 64, 47, "head", "ajna", "collective"),
  channel("61-24", 61, 24, "head", "ajna", "individual"),
  channel("63-4", 63, 4, "head", "ajna", "collective"),
  channel("17-62", 17, 62, "ajna", "throat", "collective"),
  channel("43-23", 43, 23, "ajna", "throat", "individual"),
  channel("11-56", 11, 56, "ajna", "throat", "collective"),
  channel("31-7", 31, 7, "throat", "g", "collective"),
  channel("8-1", 8, 1, "throat", "g", "individual"),
  channel("33-13", 33, 13, "throat", "g", "collective"),
  channel("20-10", 20, 10, "throat", "g", "integration"),
  channel("45-21", 45, 21, "throat", "heart", "tribal"),
  channel("35-36", 35, 36, "throat", "solar_plexus", "collective"),
  channel("12-22", 12, 22, "throat", "solar_plexus", "individual"),
  channel("16-48", 16, 48, "throat", "spleen", "collective"),
  channel("20-57", 20, 57, "throat", "spleen", "integration"),
  channel("20-34", 20, 34, "throat", "sacral", "integration"),
  channel("2-14", 2, 14, "g", "sacral", "individual"),
  channel("15-5", 15, 5, "g", "sacral", "collective"),
  channel("46-29", 46, 29, "g", "sacral", "collective"),
  channel("10-34", 10, 34, "g", "sacral", "integration"),
  channel("25-51", 25, 51, "g", "heart", "individual"),
  channel("10-57", 10, 57, "g", "spleen", "integration"),
  channel("40-37", 40, 37, "heart", "solar_plexus", "tribal"),
  channel("26-44", 26, 44, "heart", "spleen", "tribal"),
  channel("59-6", 59, 6, "sacral", "solar_plexus", "tribal"),
  channel("34-57", 34, 57, "sacral", "spleen", "integration"),
  channel("27-50", 27, 50, "sacral", "spleen", "tribal"),
  channel("3-60", 3, 60, "sacral", "root", "individual"),
  channel("42-53", 42, 53, "sacral", "root", "collective"),
  channel("9-52", 9, 52, "sacral", "root", "collective"),
  channel("32-54", 32, 54, "spleen", "root", "tribal"),
  channel("28-38", 28, 38, "spleen", "root", "individual"),
  channel("18-58", 18, 58, "spleen", "root", "collective"),
  channel("30-41", 30, 41, "solar_plexus", "root", "collective"),
  channel("55-39", 55, 39, "solar_plexus", "root", "individual"),
  channel("49-19", 49, 19, "solar_plexus", "root", "tribal")
] as const satisfies readonly HumanDesignChannelDefinition[];

export function getHumanDesignCenter(code: string): HumanDesignCenterDefinition {
  const center = HUMAN_DESIGN_CENTERS.find((candidate) => candidate.code === code);
  if (!center) {
    throw new Error(`Unsupported Human Design center: ${code}`);
  }
  return center;
}

export function getHumanDesignChannel(code: string): HumanDesignChannelDefinition {
  const channel = HUMAN_DESIGN_CHANNELS.find((candidate) => candidate.code === code);
  if (!channel) {
    throw new Error(`Unsupported Human Design channel: ${code}`);
  }
  return channel;
}

function channel(
  code: HumanDesignChannelCode,
  gateA: HumanDesignGateNumber,
  gateB: HumanDesignGateNumber,
  centerA: HumanDesignCenterCode,
  centerB: HumanDesignCenterCode,
  circuit: HumanDesignCircuit
): HumanDesignChannelDefinition {
  return { code, gateA, gateB, centerA, centerB, circuit };
}
