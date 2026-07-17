import { describe, expect, it } from "vitest";
import type { AvailabilitySchedule, ProjectionContext } from "./availability-types";
import { projectAvailableSlots } from "./slot-projection";

const baseSchedule: AvailabilitySchedule = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Основное расписание",
  timeZone: "Europe/Moscow",
  isDefault: true,
  version: 1,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 10,
  minimumNoticeMinutes: 0,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: null,
  weeklyPeriods: [
    { weekday: 5, startMinute: 600, endMinute: 720 },
    { weekday: 5, startMinute: 840, endMinute: 960 }
  ],
  dateOverrides: [],
  productIds: ["33333333-3333-4333-8333-333333333333"],
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

function context(overrides: Partial<ProjectionContext> = {}): ProjectionContext {
  return {
    schedule: baseSchedule,
    activeReservations: [],
    confirmedBookingCountByLocalDate: {},
    ...overrides
  };
}

describe("availability slot projection", () => {
  it("projects split periods and keeps occupied buffers separate from service time", () => {
    const slots = projectAvailableSlots({
      context: context(),
      productDurationMinutes: 60,
      rangeStartAt: "2026-05-28T21:00:00.000Z",
      rangeEndAt: "2026-05-29T21:00:00.000Z",
      now: "2026-05-20T00:00:00.000Z"
    });

    expect(slots.map((slot) => slot.serviceStartAt)).toEqual([
      "2026-05-29T07:00:00Z",
      "2026-05-29T07:30:00Z",
      "2026-05-29T08:00:00Z",
      "2026-05-29T11:00:00Z",
      "2026-05-29T11:30:00Z",
      "2026-05-29T12:00:00Z"
    ]);
    expect(slots[0]).toMatchObject({
      localDate: "2026-05-29",
      localStartMinute: 600,
      serviceEndAt: "2026-05-29T08:00:00Z",
      occupiedStartAt: "2026-05-29T06:50:00Z",
      occupiedEndAt: "2026-05-29T08:10:00Z"
    });
  });

  it("uses date overrides instead of the recurring weekday", () => {
    const unavailable = projectAvailableSlots({
      context: context({
        schedule: {
          ...baseSchedule,
          dateOverrides: [{ date: "2026-05-29", mode: "unavailable", periods: [] }]
        }
      }),
      productDurationMinutes: 60,
      rangeStartAt: "2026-05-28T21:00:00.000Z",
      rangeEndAt: "2026-05-29T21:00:00.000Z",
      now: "2026-05-20T00:00:00.000Z"
    });
    const exceptional = projectAvailableSlots({
      context: context({
        schedule: {
          ...baseSchedule,
          dateOverrides: [
            {
              date: "2026-05-29",
              mode: "available",
              periods: [{ startMinute: 1080, endMinute: 1200 }]
            }
          ]
        }
      }),
      productDurationMinutes: 60,
      rangeStartAt: "2026-05-28T21:00:00.000Z",
      rangeEndAt: "2026-05-29T21:00:00.000Z",
      now: "2026-05-20T00:00:00.000Z"
    });

    expect(unavailable).toEqual([]);
    expect(exceptional.map((slot) => slot.localStartMinute)).toEqual([1080, 1110, 1140]);
  });

  it("removes occupied overlaps while preserving adjacent half-open ranges", () => {
    const slots = projectAvailableSlots({
      context: context({
        activeReservations: [
          {
            occupiedStartAt: "2026-05-29T06:00:00.000Z",
            occupiedEndAt: "2026-05-29T06:50:00.000Z"
          },
          {
            occupiedStartAt: "2026-05-29T08:10:00.000Z",
            occupiedEndAt: "2026-05-29T09:00:00.000Z"
          },
          {
            occupiedStartAt: "2026-05-29T10:55:00.000Z",
            occupiedEndAt: "2026-05-29T12:00:00.000Z"
          }
        ]
      }),
      productDurationMinutes: 60,
      rangeStartAt: "2026-05-28T21:00:00.000Z",
      rangeEndAt: "2026-05-29T21:00:00.000Z",
      now: "2026-05-20T00:00:00.000Z"
    });

    expect(slots.map((slot) => slot.localStartMinute)).toEqual([600]);
  });

  it("applies minimum notice, booking horizon and daily booking limit", () => {
    const schedule = {
      ...baseSchedule,
      minimumNoticeMinutes: 120,
      bookingHorizonDays: 1,
      maximumBookingsPerDay: 2,
      weeklyPeriods: [
        { weekday: 3 as const, startMinute: 780, endMinute: 900 },
        { weekday: 4 as const, startMinute: 600, endMinute: 720 },
        { weekday: 5 as const, startMinute: 600, endMinute: 720 }
      ]
    };
    const slots = projectAvailableSlots({
      context: context({
        schedule,
        confirmedBookingCountByLocalDate: { "2026-05-21": 2 }
      }),
      productDurationMinutes: 30,
      rangeStartAt: "2026-05-20T00:00:00.000Z",
      rangeEndAt: "2026-05-24T00:00:00.000Z",
      now: "2026-05-20T07:30:00.000Z"
    });

    expect(slots.every((slot) => slot.serviceStartAt >= "2026-05-20T09:30:00Z")).toBe(true);
    expect(slots.some((slot) => slot.localDate === "2026-05-21")).toBe(false);
    expect(slots.some((slot) => slot.localDate === "2026-05-22")).toBe(false);
  });

  it("omits nonexistent local times and emits both exact instants for a repeated time", () => {
    const dstSchedule: AvailabilitySchedule = {
      ...baseSchedule,
      timeZone: "Europe/Berlin",
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      weeklyPeriods: [{ weekday: 7, startMinute: 120, endMinute: 180 }]
    };
    const spring = projectAvailableSlots({
      context: context({ schedule: dstSchedule }),
      productDurationMinutes: 30,
      rangeStartAt: "2026-03-28T22:00:00.000Z",
      rangeEndAt: "2026-03-29T22:00:00.000Z",
      now: "2026-01-01T00:00:00.000Z"
    });
    const autumn = projectAvailableSlots({
      context: context({ schedule: dstSchedule }),
      productDurationMinutes: 30,
      rangeStartAt: "2026-10-24T22:00:00.000Z",
      rangeEndAt: "2026-10-25T23:00:00.000Z",
      now: "2026-09-01T00:00:00.000Z"
    });

    expect(spring).toEqual([]);
    expect(
      autumn
        .filter((slot) => slot.localStartMinute === 150)
        .map((slot) => slot.serviceStartAt)
    ).toEqual(["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"]);
  });

  it("rejects unbounded or invalid projection requests", () => {
    expect(() =>
      projectAvailableSlots({
        context: context(),
        productDurationMinutes: 0,
        rangeStartAt: "2026-05-29T00:00:00.000Z",
        rangeEndAt: "2026-05-30T00:00:00.000Z",
        now: "2026-05-20T00:00:00.000Z"
      })
    ).toThrow("Product duration must be positive");
    expect(() =>
      projectAvailableSlots({
        context: context(),
        productDurationMinutes: 60,
        rangeStartAt: "2026-01-01T00:00:00.000Z",
        rangeEndAt: "2026-05-01T00:00:00.000Z",
        now: "2026-01-01T00:00:00.000Z"
      })
    ).toThrow("Projection range cannot exceed 93 days");
  });
});
