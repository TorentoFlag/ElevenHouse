import { HUMAN_DESIGN_CENTERS, HUMAN_DESIGN_CHANNELS } from "./catalog";
import {
  HUMAN_DESIGN_ACTIVE_BODIES,
  HUMAN_DESIGN_ENGINE_REVISION,
  HUMAN_DESIGN_METHOD_CODE,
  HUMAN_DESIGN_SCHEMA_VERSION,
  type HumanDesignCelestialBody,
  type HumanDesignMethodCode,
  type HumanDesignSchemaVersion
} from "./human-design-types";

export type HumanDesignMethodPassport = {
  readonly methodCode: HumanDesignMethodCode;
  readonly engineRevision: typeof HUMAN_DESIGN_ENGINE_REVISION;
  readonly schemaVersion: HumanDesignSchemaVersion;
  readonly zodiac: "tropical";
  readonly designMoment: "exact_88_degree_solar_arc";
  readonly earthCalculation: "sun_longitude_plus_180";
  readonly nodeMode: "true_node_initial";
  readonly supportedDepth: "gate_line";
  readonly activeBodies: readonly HumanDesignCelestialBody[];
  readonly centers: typeof HUMAN_DESIGN_CENTERS;
  readonly channels: typeof HUMAN_DESIGN_CHANNELS;
};

export const HUMAN_DESIGN_METHOD_PASSPORT: HumanDesignMethodPassport = {
  methodCode: HUMAN_DESIGN_METHOD_CODE,
  engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
  schemaVersion: HUMAN_DESIGN_SCHEMA_VERSION,
  zodiac: "tropical",
  designMoment: "exact_88_degree_solar_arc",
  earthCalculation: "sun_longitude_plus_180",
  nodeMode: "true_node_initial",
  supportedDepth: "gate_line",
  activeBodies: HUMAN_DESIGN_ACTIVE_BODIES,
  centers: HUMAN_DESIGN_CENTERS,
  channels: HUMAN_DESIGN_CHANNELS
};

export function resolveHumanDesignMethod(code: string): HumanDesignMethodPassport {
  if (code !== HUMAN_DESIGN_METHOD_CODE) {
    throw new Error(`Unsupported Human Design method: ${code}`);
  }
  return HUMAN_DESIGN_METHOD_PASSPORT;
}
