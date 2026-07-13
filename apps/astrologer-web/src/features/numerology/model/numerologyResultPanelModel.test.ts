import { describe, expect, it } from "vitest";
import {
  buildPersonalMonthItems,
  formatNullableNumerologyNumber,
  getPersonalYear,
  getPersonalYearEssence
} from "./numerologyResultPanelModel";

describe("numerologyResultPanelModel", () => {
  it("uses server-provided personal month values without recalculating them", () => {
    const months = buildPersonalMonthItems({
      personalMonths: Array.from({ length: 12 }, (_, index) => ({
        year: 2026,
        month: index + 1,
        value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3][index]!
      })),
      currentMonth: 7
    });

    expect(months.year).toBe(2026);
    expect(months.items).toHaveLength(12);
    expect(months.items[0]).toMatchObject({ label: "Янв", value: 1, isCurrent: false });
    expect(months.items[6]).toMatchObject({ label: "Июл", value: 7, isCurrent: true });
    expect(months.items[11]).toMatchObject({ label: "Дек", value: 3, isCurrent: false });
  });

  it("reads the server-provided personal year and formats nullable values", () => {
    expect(formatNullableNumerologyNumber(null)).toBe("—");
    expect(formatNullableNumerologyNumber(8)).toBe("8");
    expect(getPersonalYear({ personalYear: { year: 2026, value: 6 } })).toEqual({
      year: 2026,
      value: 6
    });
    expect(getPersonalYear({ personalYear: null })).toBeNull();
    expect(
      getPersonalYearEssence({
        keyNumbers: [{ code: "personalYear", meaning: { essence: "завершение цикла" } }]
      })
    ).toBe("завершение цикла");
  });
});
