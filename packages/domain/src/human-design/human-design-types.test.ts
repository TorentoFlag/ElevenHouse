import { describe, expect, it } from "vitest";
import {
  HUMAN_DESIGN_ACTIVE_BODIES,
  HUMAN_DESIGN_ENGINE_REVISION,
  HUMAN_DESIGN_METHOD_CODE,
  HUMAN_DESIGN_SCHEMA_VERSION,
  type HumanDesignActivation
} from "./human-design-types";

describe("Human Design domain types", () => {
  it("locks the initial method identity and active body order", () => {
    expect(HUMAN_DESIGN_METHOD_CODE).toBe("human_design_classic");
    expect(HUMAN_DESIGN_ENGINE_REVISION).toBe(1);
    expect(HUMAN_DESIGN_SCHEMA_VERSION).toBe("human-design-result.v1");
    expect(HUMAN_DESIGN_ACTIVE_BODIES).toEqual([
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
    ]);
  });

  it("represents a deterministic activation without frontend-owned fields", () => {
    const activation: HumanDesignActivation = {
      side: "personality",
      body: "sun",
      longitude: 42.125,
      gate: 13,
      line: 2
    };

    expect(activation).toEqual({
      side: "personality",
      body: "sun",
      longitude: 42.125,
      gate: 13,
      line: 2
    });
  });
});
