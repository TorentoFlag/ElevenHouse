import { describe, expect, it } from "vitest";
import { LADINI_22_GOLDEN_FIXTURES } from "./golden-fixtures";
import { calculateLadini22Individual } from "./individual";

const fixture = LADINI_22_GOLDEN_FIXTURES[0];

describe("Ladini 22 individual Matrix", () => {
  it("matches the complete approved 14.03.1990 golden fixture", () => {
    expect(calculateLadini22Individual({ participant: fixture.participant })).toEqual(
      fixture.expected
    );
  });

  it.each(["1990-02-29", "1990-13-01", "not-a-date"])(
    "rejects invalid birth date %s",
    (birthDate) =>
      expect(() =>
        calculateLadini22Individual({
          participant: { ...fixture.participant, birthDate }
        })
      ).toThrow("valid ISO calendar date")
  );
});
