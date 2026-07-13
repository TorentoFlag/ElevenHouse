import { describe, expect, it } from "vitest";
import { calculatePeriodNumbers } from "./period-numbers";

describe("Pythagorean RU periods", () => {
  it("calculates independently requested year, all months and explicit day", () => {
    const result = calculatePeriodNumbers("2000-08-19", {
      personalYear: { year: 2027 },
      personalMonths: { year: 2028 },
      personalDay: { date: "2029-12-31" }
    });

    expect(result.personalYear).toEqual({ year: 2027, value: 11 });
    expect(result.personalMonths).toHaveLength(12);
    expect(result.personalMonths?.[0]).toEqual({ year: 2028, month: 1, value: 4 });
    expect(result.personalDay).toEqual({ date: "2029-12-31", value: 11 });
  });
});
