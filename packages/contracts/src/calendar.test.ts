import { describe, expect, it } from "vitest";
import {
  availabilityScheduleResponseSchema,
  calendarRangeQuerySchema,
  calendarRangeResponseSchema,
  createManualBookingRequestSchema,
  manualBookingResponseSchema,
  replaceAvailabilityScheduleRequestSchema
} from "./calendar";

const scheduleId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const reservationId = "33333333-3333-4333-8333-333333333333";
const clientUserId = "44444444-4444-4444-8444-444444444444";
const productId = "55555555-5555-4555-8555-555555555555";

const validSchedule = {
  id: scheduleId,
  name: "Основное расписание",
  timeZone: "Europe/Moscow",
  version: 3,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 10,
  minimumNoticeMinutes: 360,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: 5,
  weeklyPeriods: [
    { weekday: 1, startMinute: 600, endMinute: 780 },
    { weekday: 1, startMinute: 900, endMinute: 1140 }
  ],
  dateOverrides: [
    { date: "2026-05-28", mode: "unavailable", periods: [] },
    {
      date: "2026-05-30",
      mode: "available",
      periods: [{ startMinute: 660, endMinute: 780 }]
    }
  ],
  productIds: [productId]
} as const;

describe("calendar contracts", () => {
  it("parses a complete availability schedule response", () => {
    expect(availabilityScheduleResponseSchema.parse({ schedule: validSchedule })).toEqual({
      schedule: validSchedule
    });
  });

  it("accepts an aggregate replacement but rejects overlapping periods", () => {
    const replacement = {
      expectedVersion: validSchedule.version,
      timeZone: validSchedule.timeZone,
      startIntervalMinutes: validSchedule.startIntervalMinutes,
      bufferBeforeMinutes: validSchedule.bufferBeforeMinutes,
      bufferAfterMinutes: validSchedule.bufferAfterMinutes,
      minimumNoticeMinutes: validSchedule.minimumNoticeMinutes,
      bookingHorizonDays: validSchedule.bookingHorizonDays,
      maximumBookingsPerDay: validSchedule.maximumBookingsPerDay,
      weeklyPeriods: validSchedule.weeklyPeriods,
      dateOverrides: validSchedule.dateOverrides,
      productIds: validSchedule.productIds
    };

    expect(replaceAvailabilityScheduleRequestSchema.parse(replacement)).toEqual(replacement);
    expect(
      replaceAvailabilityScheduleRequestSchema.safeParse({
        ...replacement,
        weeklyPeriods: [
          { weekday: 1, startMinute: 600, endMinute: 780 },
          { weekday: 1, startMinute: 720, endMinute: 840 }
        ]
      }).success
    ).toBe(false);
  });

  it("rejects invalid IANA zones, dates and wall-clock minute ranges", () => {
    expect(
      replaceAvailabilityScheduleRequestSchema.safeParse({
        ...validSchedule,
        expectedVersion: 3,
        timeZone: "Mars/Olympus"
      }).success
    ).toBe(false);
    expect(
      replaceAvailabilityScheduleRequestSchema.safeParse({
        ...validSchedule,
        expectedVersion: 3,
        dateOverrides: [{ date: "2026-02-30", mode: "unavailable", periods: [] }]
      }).success
    ).toBe(false);
    expect(
      replaceAvailabilityScheduleRequestSchema.safeParse({
        ...validSchedule,
        expectedVersion: 3,
        weeklyPeriods: [{ weekday: 1, startMinute: 720, endMinute: 720 }]
      }).success
    ).toBe(false);
  });

  it("normalizes and bounds calendar range queries", () => {
    expect(
      calendarRangeQuerySchema.parse({
        start: "2026-05-25T00:00:00.000Z",
        end: "2026-06-01T00:00:00.000Z",
        timeZone: "Europe/Moscow"
      })
    ).toEqual({
      start: "2026-05-25T00:00:00.000Z",
      end: "2026-06-01T00:00:00.000Z",
      timeZone: "Europe/Moscow"
    });

    expect(
      calendarRangeQuerySchema.safeParse({
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-05-01T00:00:00.000Z",
        timeZone: "Europe/Moscow"
      }).success
    ).toBe(false);
  });

  it("parses first-slice calendar entries and rejects unsupported lifecycle fiction", () => {
    const range = {
      timeZone: "Europe/Moscow",
      range: {
        start: "2026-05-25T00:00:00.000Z",
        end: "2026-06-01T00:00:00.000Z"
      },
      entries: [
        {
          id: bookingId,
          kind: "booking",
          startAt: "2026-05-29T08:00:00.000Z",
          endAt: "2026-05-29T09:00:00.000Z",
          title: "Марина К.",
          subtitle: "Натальный разбор",
          deliveryFormat: "video",
          displayStatus: "confirmed"
        },
        {
          id: reservationId,
          kind: "manual_block",
          startAt: "2026-05-28T10:00:00.000Z",
          endAt: "2026-05-28T15:00:00.000Z",
          title: "Отпуск",
          subtitle: null,
          deliveryFormat: null,
          displayStatus: "blocked"
        }
      ],
      availability: [
        {
          startAt: "2026-05-29T07:00:00.000Z",
          endAt: "2026-05-29T16:00:00.000Z"
        }
      ],
      summary: {
        bookingCount: 1,
        bookedMinutes: 60,
        byDisplayStatus: { confirmed: 1 }
      }
    } as const;

    expect(calendarRangeResponseSchema.parse(range)).toEqual(range);
    expect(
      calendarRangeResponseSchema.safeParse({
        ...range,
        entries: [{ ...range.entries[0], displayStatus: "paid" }]
      }).success
    ).toBe(false);
    expect(calendarRangeResponseSchema.safeParse({ ...range, receivedMinor: 490000 }).success).toBe(
      false
    );
  });

  it("requires an exact projected instant for a manual booking", () => {
    const request = {
      clientUserId,
      productId,
      deliveryFormat: "video",
      projectedStartAt: "2026-05-29T08:00:00.000Z"
    } as const;

    expect(createManualBookingRequestSchema.parse(request)).toEqual(request);
    expect(
      createManualBookingRequestSchema.safeParse({ ...request, projectedStartAt: "2026-05-29 11:00" })
        .success
    ).toBe(false);
    expect(
      createManualBookingRequestSchema.safeParse({
        clientUserId,
        productId,
        projectedStartAt: request.projectedStartAt
      }).success
    ).toBe(false);
  });

  it("parses an immutable manual booking response", () => {
    const response = {
      booking: {
        id: bookingId,
        reservationId,
        clientUserId,
        productId,
        state: "confirmed",
        startAt: "2026-05-29T08:00:00.000Z",
        endAt: "2026-05-29T09:00:00.000Z",
        productTitle: "Натальный разбор",
        durationMinutes: 60,
        deliveryFormat: "video",
        priceMinor: 490000,
        currency: "RUB",
        timeZone: "Europe/Moscow",
        policySnapshot: {
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
          minimumNoticeMinutes: 360
        },
        createdAt: "2026-05-20T10:00:00.000Z",
        updatedAt: "2026-05-20T10:00:00.000Z"
      },
      replayed: false
    } as const;

    expect(manualBookingResponseSchema.parse(response)).toEqual(response);
    expect(
      manualBookingResponseSchema.safeParse({
        ...response,
        booking: { ...response.booking, state: "completed" }
      }).success
    ).toBe(false);
  });
});
