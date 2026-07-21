import { describe, expect, it } from "vitest";
import { buildHumanDesignActivations, deriveOppositeLongitude } from "./activations";
import type { HumanDesignBasePlanetaryLongitudes } from "./activations";

const longitudes = (
  overrides: Partial<HumanDesignBasePlanetaryLongitudes> = {}
): HumanDesignBasePlanetaryLongitudes => ({
  sun: 302,
  moon: 307.625,
  north_node: 60.125,
  mercury: 0,
  venus: 10,
  mars: 20,
  jupiter: 30,
  saturn: 40,
  uranus: 50,
  neptune: 60,
  pluto: 70,
  ...overrides
});

describe("Human Design activation builder", () => {
  it("derives opposite longitudes for Earth and South Node", () => {
    expect(deriveOppositeLongitude(302)).toBe(122);
    expect(deriveOppositeLongitude(190)).toBe(10);
    expect(deriveOppositeLongitude(350)).toBe(170);
  });

  it("builds 26 activations in side and active-body order", () => {
    const activations = buildHumanDesignActivations({
      personality: longitudes({ sun: 302, north_node: 60.125 }),
      design: longitudes({ sun: 240.125, north_node: 0 })
    });

    expect(activations).toHaveLength(26);
    expect(activations.slice(0, 5)).toMatchObject([
      { side: "personality", body: "sun", longitude: 302, gate: 41, line: 1 },
      { side: "personality", body: "earth", longitude: 122, gate: 31, line: 1 },
      { side: "personality", body: "moon", longitude: 307.625, gate: 19, line: 1 },
      { side: "personality", body: "north_node", longitude: 60.125, gate: 20, line: 1 },
      { side: "personality", body: "south_node", longitude: 240.125, gate: 34, line: 1 }
    ]);
    expect(activations[13]).toMatchObject({
      side: "design",
      body: "sun",
      longitude: 240.125,
      gate: 34,
      line: 1
    });
    expect(activations[14]).toMatchObject({
      side: "design",
      body: "earth",
      longitude: 60.125,
      gate: 20,
      line: 1
    });
  });
});
