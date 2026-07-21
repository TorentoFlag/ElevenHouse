export const HUMAN_DESIGN_METHOD_CODE = "human_design_classic" as const;
export const HUMAN_DESIGN_ENGINE_REVISION = 1 as const;
export const HUMAN_DESIGN_SCHEMA_VERSION = "human-design-result.v1" as const;

export const HUMAN_DESIGN_GATE_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64
] as const;

export const HUMAN_DESIGN_LINE_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

export const HUMAN_DESIGN_CENTER_CODES = [
  "head",
  "ajna",
  "throat",
  "g",
  "heart",
  "spleen",
  "sacral",
  "solar_plexus",
  "root"
] as const;

export const HUMAN_DESIGN_CHANNEL_CODES = [
  "64-47",
  "61-24",
  "63-4",
  "17-62",
  "43-23",
  "11-56",
  "31-7",
  "8-1",
  "33-13",
  "20-10",
  "45-21",
  "35-36",
  "12-22",
  "16-48",
  "20-57",
  "20-34",
  "2-14",
  "15-5",
  "46-29",
  "10-34",
  "25-51",
  "10-57",
  "40-37",
  "26-44",
  "59-6",
  "34-57",
  "27-50",
  "3-60",
  "42-53",
  "9-52",
  "32-54",
  "28-38",
  "18-58",
  "30-41",
  "55-39",
  "49-19"
] as const;

export const HUMAN_DESIGN_ACTIVE_BODIES = [
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

export type HumanDesignMethodCode = typeof HUMAN_DESIGN_METHOD_CODE;
export type HumanDesignSchemaVersion = typeof HUMAN_DESIGN_SCHEMA_VERSION;
export type HumanDesignGateNumber = (typeof HUMAN_DESIGN_GATE_NUMBERS)[number];
export type HumanDesignLineNumber = (typeof HUMAN_DESIGN_LINE_NUMBERS)[number];
export type HumanDesignCenterCode = (typeof HUMAN_DESIGN_CENTER_CODES)[number];
export type HumanDesignChannelCode = (typeof HUMAN_DESIGN_CHANNEL_CODES)[number];
export type HumanDesignCelestialBody = (typeof HUMAN_DESIGN_ACTIVE_BODIES)[number];
export type HumanDesignActivationSide = "personality" | "design";

export type HumanDesignActivation = {
  readonly side: HumanDesignActivationSide;
  readonly body: HumanDesignCelestialBody;
  readonly longitude: number;
  readonly gate: HumanDesignGateNumber;
  readonly line: HumanDesignLineNumber;
};
