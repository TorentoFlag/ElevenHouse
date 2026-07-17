import { describe, expect, it } from "vitest";
import {
  createCalendarRange,
  formatCalendarRangeLabel,
  moveCalendarAnchor
} from "./calendarRange";

describe("calendar range model", () => {
  it.each([
    ["day", "2026-05-29T00:00:00+03:00", "2026-05-30T00:00:00+03:00"],
    ["week", "2026-05-25T00:00:00+03:00", "2026-06-01T00:00:00+03:00"],
    ["month", "2026-05-01T00:00:00+03:00", "2026-06-01T00:00:00+03:00"]
  ] as const)("creates a bounded %s range in the selected timezone", (view, start, end) => {
    expect(
      createCalendarRange({ view, anchorDate: "2026-05-29", timeZone: "Europe/Moscow" })
    ).toEqual({ start, end, timeZone: "Europe/Moscow" });
  });

  it("moves day, week and month anchors without browser-locale arithmetic", () => {
    expect(moveCalendarAnchor("2026-05-29", "day", 1)).toBe("2026-05-30");
    expect(moveCalendarAnchor("2026-05-29", "week", -1)).toBe("2026-05-22");
    expect(moveCalendarAnchor("2026-05-31", "month", 1)).toBe("2026-06-30");
  });

  it("formats stable Russian and English labels for every view", () => {
    const input = { anchorDate: "2026-05-29", timeZone: "Europe/Moscow" } as const;

    expect(formatCalendarRangeLabel({ ...input, view: "day", locale: "ru" })).toBe(
      "29 мая 2026 г."
    );
    expect(formatCalendarRangeLabel({ ...input, view: "week", locale: "ru" })).toBe(
      "25–31 мая 2026 г."
    );
    expect(formatCalendarRangeLabel({ ...input, view: "month", locale: "en" })).toBe(
      "May 2026"
    );
  });
});
