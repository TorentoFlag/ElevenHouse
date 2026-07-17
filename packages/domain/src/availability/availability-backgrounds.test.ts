import { describe, expect, it } from "vitest";
import type { AvailabilitySchedule } from "./availability-types";
import { projectAvailabilityBackgrounds } from "./availability-backgrounds";

const schedule: AvailabilitySchedule = {
  id: "schedule-1",
  ownerUserId: "owner-1",
  name: "Default",
  timeZone: "Europe/Moscow",
  isDefault: true,
  version: 1,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minimumNoticeMinutes: 0,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: null,
  weeklyPeriods: [{ weekday: 1, startMinute: 600, endMinute: 720 }],
  dateOverrides: [],
  productIds: [],
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z"
};

describe("projectAvailabilityBackgrounds", () => {
  it("projects configured local periods to exact UTC ranges", () => {
    expect(
      projectAvailabilityBackgrounds({
        schedule,
        rangeStartAt: "2026-07-20T00:00:00Z",
        rangeEndAt: "2026-07-21T00:00:00Z"
      })
    ).toEqual([{ startAt: "2026-07-20T07:00:00Z", endAt: "2026-07-20T09:00:00Z" }]);
  });

  it("applies date overrides and clips periods to the requested range", () => {
    expect(
      projectAvailabilityBackgrounds({
        schedule: {
          ...schedule,
          dateOverrides: [
            {
              date: "2026-07-20",
              mode: "available",
              periods: [{ startMinute: 660, endMinute: 780 }]
            }
          ]
        },
        rangeStartAt: "2026-07-20T08:30:00Z",
        rangeEndAt: "2026-07-20T09:30:00Z"
      })
    ).toEqual([{ startAt: "2026-07-20T08:30:00Z", endAt: "2026-07-20T09:30:00Z" }]);
  });

  it("rejects invalid and over-wide ranges", () => {
    expect(() =>
      projectAvailabilityBackgrounds({
        schedule,
        rangeStartAt: "2026-07-21T00:00:00Z",
        rangeEndAt: "2026-07-20T00:00:00Z"
      })
    ).toThrow("Availability background range is invalid");
    expect(() =>
      projectAvailabilityBackgrounds({
        schedule,
        rangeStartAt: "2026-01-01T00:00:00Z",
        rangeEndAt: "2026-05-01T00:00:00Z"
      })
    ).toThrow("Availability background range is invalid");
  });
});
