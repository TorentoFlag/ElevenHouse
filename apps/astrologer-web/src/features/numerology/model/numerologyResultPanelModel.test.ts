import { describe, expect, it } from "vitest";
import {
  buildPersonalMonthItems,
  formatNullableNumerologyNumber,
  getPersonalYear,
  getPersonalYearEssence,
  reduceNumerologyRoot
} from "./numerologyResultPanelModel";

describe("numerologyResultPanelModel", () => {
  it("derives personal year panel values from explicit date input", () => {
    const months = buildPersonalMonthItems({
      personalYear: 9,
      currentDate: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(months.year).toBe(2026);
    expect(months.items).toHaveLength(12);
    expect(months.items[0]).toMatchObject({ label: "Янв", value: 1, isCurrent: false });
    expect(months.items[6]).toMatchObject({ label: "Июл", value: 7, isCurrent: true });
    expect(months.items[11]).toMatchObject({ label: "Дек", value: 3, isCurrent: false });
  });

  it("keeps numerology number formatting and root reduction outside JSX", () => {
    expect(formatNullableNumerologyNumber(null)).toBe("—");
    expect(formatNullableNumerologyNumber(8)).toBe("8");
    expect(reduceNumerologyRoot(29)).toBe(2);
    expect(getPersonalYear({ keyNumbers: [{ code: "personalYear", value: 6 }] })).toBe(6);
    expect(getPersonalYear({ keyNumbers: [{ code: "lifePath", value: 9 }] })).toBeNull();
    expect(
      getPersonalYearEssence({
        keyNumbers: [{ code: "personalYear", meaning: { essence: "завершение цикла" } }]
      })
    ).toBe("завершение цикла");
    expect(getPersonalYearEssence({ keyNumbers: [{ code: "lifePath" }] })).toBeNull();
  });
});
