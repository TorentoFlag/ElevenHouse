import { mapLongitudeToHumanDesignGateLine, normalizeHumanDesignLongitude } from "./gate-wheel";
import {
  HUMAN_DESIGN_ACTIVE_BODIES,
  type HumanDesignActivation,
  type HumanDesignActivationSide,
  type HumanDesignCelestialBody
} from "./human-design-types";

export type HumanDesignBasePlanetaryLongitudes = {
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
};

export type BuildHumanDesignActivationsInput = {
  readonly personality: HumanDesignBasePlanetaryLongitudes;
  readonly design: HumanDesignBasePlanetaryLongitudes;
};

export function deriveOppositeLongitude(longitude: number): number {
  return normalizeHumanDesignLongitude(longitude + 180);
}

export function buildHumanDesignActivations(
  input: BuildHumanDesignActivationsInput
): readonly HumanDesignActivation[] {
  return [
    ...buildSideActivations("personality", input.personality),
    ...buildSideActivations("design", input.design)
  ];
}

function buildSideActivations(
  side: HumanDesignActivationSide,
  longitudes: HumanDesignBasePlanetaryLongitudes
): readonly HumanDesignActivation[] {
  return HUMAN_DESIGN_ACTIVE_BODIES.map((body) =>
    buildActivation(side, body, resolveBodyLongitude(body, longitudes))
  );
}

function buildActivation(
  side: HumanDesignActivationSide,
  body: HumanDesignCelestialBody,
  longitude: number
): HumanDesignActivation {
  const gateLine = mapLongitudeToHumanDesignGateLine(longitude);
  return {
    side,
    body,
    longitude: gateLine.normalizedLongitude,
    gate: gateLine.gate,
    line: gateLine.line
  };
}

function resolveBodyLongitude(
  body: HumanDesignCelestialBody,
  longitudes: HumanDesignBasePlanetaryLongitudes
): number {
  if (body === "earth") return deriveOppositeLongitude(longitudes.sun);
  if (body === "south_node") return deriveOppositeLongitude(longitudes.north_node);
  return longitudes[body];
}
