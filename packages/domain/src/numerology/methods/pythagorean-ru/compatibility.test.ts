import { describe, expect, it } from "vitest";
import { pythagoreanRuEngine } from "./engine";
import { golubevFixture, koshkinaFixture } from "./golden-fixtures";

describe("Pythagorean RU compatibility details", () => {
  it("uses exact thresholds and exposes four evidence zones", () => {
    const result = pythagoreanRuEngine.calculateCompatibility({
      participants: { first: golubevFixture.participant, second: koshkinaFixture.participant },
      periods: {}
    });

    expect(result.zones.map((zone) => zone.code)).toEqual([
      "identity",
      "inner_world",
      "resources",
      "dynamics"
    ]);
    expect(result.comparisons.find((item) => item.code === "birthday")).toMatchObject({
      difference: 6,
      relation: "tension"
    });
    expect(result.comparisons.find((item) => item.code === "expression")).toMatchObject({
      difference: 1,
      relation: "close"
    });
    expect(result.conclusion.explanation).not.toHaveLength(0);
  });
});
