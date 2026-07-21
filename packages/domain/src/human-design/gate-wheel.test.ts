import { describe, expect, it } from "vitest";
import {
  HUMAN_DESIGN_GATE_41_START_LONGITUDE,
  HUMAN_DESIGN_GATE_SPAN_DEGREES,
  HUMAN_DESIGN_GATE_WHEEL_SEQUENCE,
  HUMAN_DESIGN_GATE_WHEEL_VERSION,
  HUMAN_DESIGN_LINE_SPAN_DEGREES,
  mapLongitudeToHumanDesignGateLine,
  normalizeHumanDesignLongitude
} from "./gate-wheel";

describe("Human Design gate wheel", () => {
  it("locks the classic gate wheel constants", () => {
    expect(HUMAN_DESIGN_GATE_WHEEL_VERSION).toBe("rave-mandala-gate-wheel.v1");
    expect(HUMAN_DESIGN_GATE_41_START_LONGITUDE).toBe(302);
    expect(HUMAN_DESIGN_GATE_SPAN_DEGREES).toBe(5.625);
    expect(HUMAN_DESIGN_LINE_SPAN_DEGREES).toBe(0.9375);
    expect(HUMAN_DESIGN_GATE_WHEEL_SEQUENCE).toHaveLength(64);
    expect(HUMAN_DESIGN_GATE_WHEEL_SEQUENCE.slice(0, 6)).toEqual([41, 19, 13, 49, 30, 55]);
    expect(HUMAN_DESIGN_GATE_WHEEL_SEQUENCE.slice(-4)).toEqual([38, 54, 61, 60]);
  });

  it("normalizes longitudes into the 0-360 degree range", () => {
    expect(normalizeHumanDesignLongitude(302)).toBe(302);
    expect(normalizeHumanDesignLongitude(662)).toBe(302);
    expect(normalizeHumanDesignLongitude(-58)).toBe(302);
    expect(normalizeHumanDesignLongitude(360)).toBe(0);
  });

  it("maps gate and line using start-inclusive end-exclusive boundaries", () => {
    expect(mapLongitudeToHumanDesignGateLine(302)).toMatchObject({
      normalizedLongitude: 302,
      gate: 41,
      line: 1,
      gateIndex: 0,
      gateStartLongitude: 302,
      degreesIntoGate: 0,
      degreesIntoLine: 0
    });
    expect(mapLongitudeToHumanDesignGateLine(302 + 0.9375)).toMatchObject({
      gate: 41,
      line: 2
    });
    expect(mapLongitudeToHumanDesignGateLine(307.625)).toMatchObject({
      gate: 19,
      line: 1,
      gateIndex: 1,
      gateStartLongitude: 307.625
    });
  });

  it("maps zodiac wrap examples from the researched degree table", () => {
    expect(mapLongitudeToHumanDesignGateLine(0)).toMatchObject({
      gate: 25,
      line: 2,
      gateStartLongitude: 358.25
    });
    expect(mapLongitudeToHumanDesignGateLine(60.125)).toMatchObject({
      gate: 20,
      line: 1,
      gateStartLongitude: 60.125
    });
    expect(mapLongitudeToHumanDesignGateLine(242)).toMatchObject({
      gate: 34,
      line: 3,
      gateStartLongitude: 240.125
    });
  });

  it("rejects non-finite longitude input", () => {
    expect(() => mapLongitudeToHumanDesignGateLine(Number.NaN)).toThrow(
      "Human Design longitude must be a finite number"
    );
    expect(() => mapLongitudeToHumanDesignGateLine(Number.POSITIVE_INFINITY)).toThrow(
      "Human Design longitude must be a finite number"
    );
  });
});
