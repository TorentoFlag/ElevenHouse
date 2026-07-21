import { describe, expect, it } from "vitest";
import { HUMAN_DESIGN_METHOD_PASSPORT, resolveHumanDesignMethod } from "./method-passport";

describe("Human Design method passport", () => {
  it("locks the selected production method choices", () => {
    expect(HUMAN_DESIGN_METHOD_PASSPORT).toMatchObject({
      methodCode: "human_design_classic",
      engineRevision: 1,
      schemaVersion: "human-design-result.v1",
      zodiac: "tropical",
      designMoment: "exact_88_degree_solar_arc",
      earthCalculation: "sun_longitude_plus_180",
      nodeMode: "true_node_initial",
      supportedDepth: "gate_line"
    });
    expect(HUMAN_DESIGN_METHOD_PASSPORT.activeBodies).toHaveLength(13);
    expect(HUMAN_DESIGN_METHOD_PASSPORT.centers).toHaveLength(9);
    expect(HUMAN_DESIGN_METHOD_PASSPORT.channels).toHaveLength(36);
  });

  it("resolves only the supported method", () => {
    expect(resolveHumanDesignMethod("human_design_classic")).toBe(HUMAN_DESIGN_METHOD_PASSPORT);
    expect(() => resolveHumanDesignMethod("provider_default")).toThrow(
      "Unsupported Human Design method"
    );
  });
});
