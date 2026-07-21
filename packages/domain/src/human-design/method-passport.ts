import { HUMAN_DESIGN_CENTERS, HUMAN_DESIGN_CHANNELS } from "./catalog";
import {
  HUMAN_DESIGN_GATE_41_START_LONGITUDE,
  HUMAN_DESIGN_GATE_SPAN_DEGREES,
  HUMAN_DESIGN_GATE_WHEEL_SEQUENCE,
  HUMAN_DESIGN_GATE_WHEEL_VERSION,
  HUMAN_DESIGN_LINE_SPAN_DEGREES
} from "./gate-wheel";
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
  readonly gateWheel: {
    readonly version: typeof HUMAN_DESIGN_GATE_WHEEL_VERSION;
    readonly gate41StartLongitude: typeof HUMAN_DESIGN_GATE_41_START_LONGITUDE;
    readonly gateSpanDegrees: typeof HUMAN_DESIGN_GATE_SPAN_DEGREES;
    readonly lineSpanDegrees: typeof HUMAN_DESIGN_LINE_SPAN_DEGREES;
    readonly sequence: typeof HUMAN_DESIGN_GATE_WHEEL_SEQUENCE;
  };
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
  channels: HUMAN_DESIGN_CHANNELS,
  gateWheel: {
    version: HUMAN_DESIGN_GATE_WHEEL_VERSION,
    gate41StartLongitude: HUMAN_DESIGN_GATE_41_START_LONGITUDE,
    gateSpanDegrees: HUMAN_DESIGN_GATE_SPAN_DEGREES,
    lineSpanDegrees: HUMAN_DESIGN_LINE_SPAN_DEGREES,
    sequence: HUMAN_DESIGN_GATE_WHEEL_SEQUENCE
  }
};

export function resolveHumanDesignMethod(code: string): HumanDesignMethodPassport {
  if (code !== HUMAN_DESIGN_METHOD_CODE) {
    throw new Error(`Unsupported Human Design method: ${code}`);
  }
  return HUMAN_DESIGN_METHOD_PASSPORT;
}
