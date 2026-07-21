import type { HumanDesignGateNumber, HumanDesignLineNumber } from "./human-design-types";

export const HUMAN_DESIGN_GATE_WHEEL_VERSION = "rave-mandala-gate-wheel.v1" as const;
export const HUMAN_DESIGN_GATE_SPAN_DEGREES = 5.625 as const;
export const HUMAN_DESIGN_LINE_SPAN_DEGREES = 0.9375 as const;
export const HUMAN_DESIGN_GATE_41_START_LONGITUDE = 302 as const;

export const HUMAN_DESIGN_GATE_WHEEL_SEQUENCE = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23,
  8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64,
  47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58,
  38, 54, 61, 60
] as const satisfies readonly HumanDesignGateNumber[];

export type HumanDesignGateLine = {
  readonly longitude: number;
  readonly normalizedLongitude: number;
  readonly gate: HumanDesignGateNumber;
  readonly line: HumanDesignLineNumber;
  readonly gateIndex: number;
  readonly gateStartLongitude: number;
  readonly degreesIntoGate: number;
  readonly degreesIntoLine: number;
};

export function normalizeHumanDesignLongitude(longitude: number): number {
  assertFiniteLongitude(longitude);
  return roundDegrees(((longitude % 360) + 360) % 360);
}

export function mapLongitudeToHumanDesignGateLine(longitude: number): HumanDesignGateLine {
  const normalizedLongitude = normalizeHumanDesignLongitude(longitude);
  const normalizedDistanceFromStart = normalizeHumanDesignLongitude(
    normalizedLongitude - HUMAN_DESIGN_GATE_41_START_LONGITUDE
  );
  const gateIndex = Math.min(
    Math.floor(normalizedDistanceFromStart / HUMAN_DESIGN_GATE_SPAN_DEGREES),
    HUMAN_DESIGN_GATE_WHEEL_SEQUENCE.length - 1
  );
  const degreesIntoGate = roundDegrees(
    normalizedDistanceFromStart - gateIndex * HUMAN_DESIGN_GATE_SPAN_DEGREES
  );
  const line = Math.min(
    Math.floor(degreesIntoGate / HUMAN_DESIGN_LINE_SPAN_DEGREES) + 1,
    6
  ) as HumanDesignLineNumber;

  return {
    longitude,
    normalizedLongitude,
    gate: HUMAN_DESIGN_GATE_WHEEL_SEQUENCE[gateIndex]!,
    line,
    gateIndex,
    gateStartLongitude: normalizeHumanDesignLongitude(
      HUMAN_DESIGN_GATE_41_START_LONGITUDE + gateIndex * HUMAN_DESIGN_GATE_SPAN_DEGREES
    ),
    degreesIntoGate,
    degreesIntoLine: roundDegrees(degreesIntoGate - (line - 1) * HUMAN_DESIGN_LINE_SPAN_DEGREES)
  };
}

function assertFiniteLongitude(longitude: number): void {
  if (!Number.isFinite(longitude)) {
    throw new Error("Human Design longitude must be a finite number");
  }
}

function roundDegrees(value: number): number {
  return Math.round(value * 10_000_000_000) / 10_000_000_000;
}
