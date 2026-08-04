import { describe, expect, it } from "vitest";
import { chartDstOccurrenceCopyByLocale, updateChartCivilMoment } from "./chartCivilTimeOccurrence";

describe("chartCivilTimeOccurrence", () => {
  it("persists an explicit repeated-hour occurrence without changing the civil moment", () => {
    expect(
      updateChartCivilMoment(
        {
          date: "2026-10-25",
          time: "02:30",
          timezone: "Europe/Rome",
          question: "Стоит ли принимать предложение?"
        },
        { dstOccurrence: "second" }
      )
    ).toEqual({
      date: "2026-10-25",
      time: "02:30",
      timezone: "Europe/Rome",
      question: "Стоит ли принимать предложение?",
      dstOccurrence: "second"
    });
  });

  it.each([
    ["date", "2026-10-26"],
    ["time", "02:31"],
    ["timezone", "Europe/Paris"]
  ] as const)("clears the occurrence when %s changes", (field, value) => {
    expect(
      updateChartCivilMoment(
        {
          date: "2026-10-25",
          time: "02:30",
          timezone: "Europe/Rome",
          dstOccurrence: "second" as const
        },
        { [field]: value }
      )
    ).not.toHaveProperty("dstOccurrence");
  });

  it("keeps the occurrence when the civil value is written unchanged", () => {
    expect(
      updateChartCivilMoment(
        {
          date: "2026-10-25",
          time: "02:30",
          timezone: "Europe/Rome",
          dstOccurrence: "first" as const
        },
        { timezone: "Europe/Rome" }
      )
    ).toMatchObject({ dstOccurrence: "first" });
  });

  it("provides complete Russian and English select copy", () => {
    expect(chartDstOccurrenceCopyByLocale.ru).toEqual({
      label: "Повторный час",
      none: "Не выбрано",
      first: "Первое вхождение",
      second: "Второе вхождение",
      helper: "Выберите вариант только если местное время повторялось при переводе часов."
    });
    expect(chartDstOccurrenceCopyByLocale.en).toEqual({
      label: "Repeated hour",
      none: "Not selected",
      first: "First occurrence",
      second: "Second occurrence",
      helper: "Choose only when the local clock time occurred twice during a DST change."
    });
  });
});
