import { describe, expect, it } from "vitest";
import {
  buildPersonalMonthItems,
  formatNullableNumerologyNumber,
  getPersonalYear,
  getPersonalYearEssence,
  getStrengthLineAccessibleLabel,
  getStrengthLineMeterPercent
} from "./numerologyResultPanelModel";

describe("numerologyResultPanelModel", () => {
  it("uses server-provided personal month values without recalculating them", () => {
    const months = buildPersonalMonthItems({
      personalMonths: Array.from({ length: 12 }, (_, index) => ({
        year: 2026,
        month: index + 1,
        value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3][index]!
      })),
      currentYear: 2026,
      currentMonth: 7
    });

    expect(months.year).toBe(2026);
    expect(months.items).toHaveLength(12);
    expect(months.items[0]).toMatchObject({ label: "Янв", value: 1, isCurrent: false });
    expect(months.items[6]).toMatchObject({ label: "Июл", value: 7, isCurrent: true });
    expect(months.items[11]).toMatchObject({ label: "Дек", value: 3, isCurrent: false });
  });

  it("does not mark the same month as current in a retrospective year", () => {
    const months = buildPersonalMonthItems({
      personalMonths: [{ year: 2025, month: 7, value: 4 }],
      currentYear: 2026,
      currentMonth: 7
    });

    expect(months.items[0]?.isCurrent).toBe(false);
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

  it("maps strength-line levels to their semantic meter positions", () => {
    expect(getStrengthLineMeterPercent("absent")).toBe(0);
    expect(getStrengthLineMeterPercent("weak")).toBe(25);
    expect(getStrengthLineMeterPercent("moderate")).toBe(50);
    expect(getStrengthLineMeterPercent("expressed")).toBe(75);
    expect(getStrengthLineMeterPercent("strong")).toBe(100);
    expect(getStrengthLineMeterPercent("unknown")).toBe(0);
  });

  it("describes a strength line without presenting its meter as a measured percentage", () => {
    expect(
      getStrengthLineAccessibleLabel({
        label: "Семейность",
        value: 3,
        level: "Выраженная линия"
      })
    ).toBe("Семейность, 3, Выраженная линия");
  });
});
