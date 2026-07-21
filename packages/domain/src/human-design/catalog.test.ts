import { describe, expect, it } from "vitest";
import {
  getHumanDesignCenter,
  getHumanDesignChannel,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS
} from "./catalog";

describe("Human Design catalog", () => {
  it("defines the 9 centers with stable codes", () => {
    expect(HUMAN_DESIGN_CENTERS.map((center) => center.code)).toEqual([
      "head",
      "ajna",
      "throat",
      "g",
      "heart",
      "spleen",
      "sacral",
      "solar_plexus",
      "root"
    ]);
  });

  it("defines all 36 channels with gate and center endpoints", () => {
    expect(HUMAN_DESIGN_CHANNELS).toHaveLength(36);
    expect(getHumanDesignChannel("20-34")).toEqual({
      code: "20-34",
      gateA: 20,
      gateB: 34,
      centerA: "throat",
      centerB: "sacral",
      circuit: "integration"
    });
    expect(getHumanDesignChannel("59-6")).toEqual({
      code: "59-6",
      gateA: 59,
      gateB: 6,
      centerA: "sacral",
      centerB: "solar_plexus",
      circuit: "tribal"
    });
  });

  it("rejects unsupported lookup codes", () => {
    expect(() => getHumanDesignCenter("unknown")).toThrow("Unsupported Human Design center");
    expect(() => getHumanDesignChannel("1-2")).toThrow("Unsupported Human Design channel");
  });
});
