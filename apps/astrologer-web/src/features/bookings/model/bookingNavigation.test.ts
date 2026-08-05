import { describe, expect, it } from "vitest";

import {
  bookingCalendarAnchorDate,
  buildBookingCalendarPath,
  parseBookingCalendarHandoff
} from "./bookingNavigation";

describe("booking calendar navigation", () => {
  const handoff = {
    bookingId: "77777777-7777-4777-8777-777777777777",
    startAt: "2026-08-05T22:30:00.000Z"
  } as const;

  it("round-trips a strict booking handoff through the calendar URL", () => {
    const path = buildBookingCalendarPath(handoff);

    expect(path).toBe(
      "/calendar?bookingId=77777777-7777-4777-8777-777777777777&startAt=2026-08-05T22%3A30%3A00.000Z"
    );
    expect(parseBookingCalendarHandoff(path.slice(path.indexOf("?")))).toEqual(handoff);
  });

  it("rejects incomplete handoffs and derives the calendar date in the profile timezone", () => {
    expect(parseBookingCalendarHandoff("?bookingId=not-a-uuid")).toBeNull();
    expect(bookingCalendarAnchorDate(handoff, "Europe/Moscow")).toBe("2026-08-06");
  });
});
