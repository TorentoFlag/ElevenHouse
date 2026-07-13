import { describe, expect, it } from "vitest";
import { resolveNumerologyMethod } from "../../method-registry";
import { compatibilityFixture, golubevFixture, koshkinaFixture } from "./golden-fixtures";

describe("canonical Pythagorean RU engine", () => {
  const engine = resolveNumerologyMethod("pythagorean");

  it.each([golubevFixture, koshkinaFixture])(
    "matches golden individual fixture $participant.calculationName",
    ({ participant, expected }) => {
      const result = engine.calculateIndividual({ participant, periods: {} });
      expect(result.keyNumbers).toEqual(expected.keyNumbers);
      expect(result.psychomatrix.workingNumbers).toEqual(expected.workingNumbers);
      expect(result.psychomatrix.cells).toEqual(expected.cells);
      expect(
        Object.fromEntries(result.strengthLines.map((line) => [line.code, line.value]))
      ).toEqual(expected.lines);
      expect(Object.keys(result)).not.toContain("method" + "Version");
    }
  );

  it("returns complete, order-independent golden compatibility", () => {
    const forward = engine.calculateCompatibility({
      participants: { first: golubevFixture.participant, second: koshkinaFixture.participant },
      periods: {}
    });
    const reversed = engine.calculateCompatibility({
      participants: { first: koshkinaFixture.participant, second: golubevFixture.participant },
      periods: {}
    });

    expect(forward.pairNumber).toBe(compatibilityFixture.pairNumber);
    expect(forward.counts).toEqual(compatibilityFixture.counts);
    expect(forward.conclusion.code).toBe(compatibilityFixture.conclusion);
    expect(forward.comparisons.filter((item) => item.block === "key_numbers")).toHaveLength(5);
    expect(forward.comparisons.filter((item) => item.block === "psychomatrix")).toHaveLength(9);
    expect(forward.comparisons.filter((item) => item.block === "strength_lines")).toHaveLength(8);
    expect(forward.comparisons).toHaveLength(22);
    expect(
      forward.comparisons.every(
        (item) =>
          item.block &&
          item.code &&
          Number.isFinite(item.valueA) &&
          Number.isFinite(item.valueB) &&
          Number.isFinite(item.difference) &&
          item.relation &&
          item.explanation.length > 0
      )
    ).toBe(true);
    expect(reversed.pairNumber).toBe(forward.pairNumber);
    expect(reversed.counts).toEqual(forward.counts);
    expect(reversed.conclusion).toEqual(forward.conclusion);
  });
});
