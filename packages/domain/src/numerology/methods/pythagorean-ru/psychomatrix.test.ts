import { describe, expect, it } from "vitest";
import { calculatePsychomatrix } from "./psychomatrix";

describe("Pythagorean RU psychomatrix", () => {
  it("uses absolute third working number and fully reduced second/fourth", () => {
    expect(calculatePsychomatrix("2000-01-07").workingNumbers).toEqual({
      first: 10,
      second: 1,
      third: 4,
      fourth: 4
    });
  });

  it("uses the unsigned magnitude when the raw third working number is negative", () => {
    expect(calculatePsychomatrix("1000-01-30").workingNumbers).toEqual({
      first: 5,
      second: 5,
      third: 1,
      fourth: 1
    });
  });
});
