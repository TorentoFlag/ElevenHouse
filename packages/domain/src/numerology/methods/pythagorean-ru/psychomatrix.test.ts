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
});
