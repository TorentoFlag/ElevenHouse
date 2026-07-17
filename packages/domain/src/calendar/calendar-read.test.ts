import { describe, expect, it, vi } from "vitest";
import {
  CalendarRangeValidationError,
  readCalendarRange,
  type CalendarReadStore
} from "./calendar-read";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const range = {
  startAt: "2026-05-25T00:00:00Z",
  endAt: "2026-06-01T00:00:00Z"
};

describe("calendar range read", () => {
  it("normalizes a bounded exact range and delegates an owner-scoped query", async () => {
    const result = {
      entries: [],
      summary: { bookingCount: 0, bookedMinutes: 0, byDisplayStatus: {} }
    };
    const store: CalendarReadStore = { readRange: vi.fn(async () => result) };

    await expect(
      readCalendarRange({
        store,
        ownerUserId,
        startAt: "2026-05-25T03:00:00+03:00",
        endAt: "2026-06-01T03:00:00+03:00"
      })
    ).resolves.toEqual(result);
    expect(store.readRange).toHaveBeenCalledWith({ ownerUserId, ...range });
  });

  it("rejects reversed and over-93-day reads before persistence", async () => {
    const store: CalendarReadStore = {
      readRange: vi.fn(async () => ({
        entries: [],
        summary: { bookingCount: 0, bookedMinutes: 0, byDisplayStatus: {} }
      }))
    };

    await expect(
      readCalendarRange({ store, ownerUserId, startAt: range.endAt, endAt: range.startAt })
    ).rejects.toBeInstanceOf(CalendarRangeValidationError);
    await expect(
      readCalendarRange({
        store,
        ownerUserId,
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-05-01T00:00:00Z"
      })
    ).rejects.toBeInstanceOf(CalendarRangeValidationError);
    expect(store.readRange).not.toHaveBeenCalled();
  });
});
