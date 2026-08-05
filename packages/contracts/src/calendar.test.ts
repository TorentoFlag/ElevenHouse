import { describe, expect, it } from "vitest";
import {
  availabilityScheduleResponseSchema,
  availableBookingSlotsQuerySchema,
  availableBookingSlotsResponseSchema,
  bookingLifecycleStateSchema,
  bookingParamsSchema,
  bookingResponseSchema,
  cancelBookingRequestSchema,
  cancelBookingResponseSchema,
  completeBookingRequestSchema,
  completeBookingResponseSchema,
  rescheduleBookingRequestSchema,
  rescheduleBookingResponseSchema,
  createPaidBookingHoldRequestSchema,
  calendarRangeQuerySchema,
  calendarRangeResponseSchema,
  createManualBlockRequestSchema,
  createManualBookingRequestSchema,
  manualBlockResponseSchema,
  manualBlockParamsSchema,
  manualBookingResponseSchema,
  paidBookingHoldResponseSchema,
  putDefaultAvailabilityScheduleRequestSchema,
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
  it("bounds a product-specific available-slot query and response", () => {
    const query = {
      productId,
      start: "2026-05-25T00:00:00.000Z",
      end: "2026-06-01T00:00:00.000Z"
    };
    const response = {
      productId,
      timeZone: "Europe/Moscow",
      slots: [
        {
          startAt: "2026-05-29T07:00:00.000Z",
          endAt: "2026-05-29T08:00:00.000Z"
        }
      ]
    };
    const [firstSlot] = response.slots;
    expect(firstSlot).toBeDefined();

    expect(availableBookingSlotsQuerySchema.parse(query)).toEqual(query);
    expect(availableBookingSlotsResponseSchema.parse(response)).toEqual(response);
    expect(
      availableBookingSlotsQuerySchema.safeParse({
        ...query,
        end: "2026-09-01T00:00:00.000Z"
      }).success
    ).toBe(false);
    expect(
      availableBookingSlotsResponseSchema.safeParse({
        ...response,
        slots: [{ startAt: firstSlot!.endAt, endAt: firstSlot!.startAt }]
      }).success
    ).toBe(false);
  });

  it("parses booking read params and a response without replay metadata", () => {
    expect(bookingParamsSchema.parse({ bookingId })).toEqual({ bookingId });
    expect(bookingParamsSchema.safeParse({ bookingId: "not-a-uuid" }).success).toBe(false);
    expect(
      bookingResponseSchema.parse({
        booking: {
          id: bookingId,
          reservationId,
          clientUserId,
          productId,
          source: "manual",
          state: "confirmed",
          lifecycleRevision: 1,
          holdExpiresAt: null,
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
          createdAt: "2026-05-20T08:00:00.000Z",
          updatedAt: "2026-05-20T08:00:00.000Z"
        }
      })
    ).not.toHaveProperty("replayed");
  });

  it("accepts only UUID manual block route identifiers", () => {
    expect(manualBlockParamsSchema.parse({ blockId: bookingId })).toEqual({
      blockId: bookingId
    });
    expect(manualBlockParamsSchema.safeParse({ blockId: "not-a-uuid" }).success).toBe(false);
  });

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

  it("accepts create-or-update semantics for the default schedule", () => {
    const request = {
      expectedVersion: null,
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

    expect(putDefaultAvailabilityScheduleRequestSchema.parse(request)).toEqual(request);
    expect(
      putDefaultAvailabilityScheduleRequestSchema.parse({ ...request, expectedVersion: 3 })
    ).toEqual({ ...request, expectedVersion: 3 });
    expect(
      putDefaultAvailabilityScheduleRequestSchema.safeParse({ ...request, expectedVersion: 0 })
        .success
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

  it("bounds manual blocks and parses their persisted response", () => {
    const request = {
      title: "Отпуск",
      startAt: "2026-05-28T10:00:00.000Z",
      endAt: "2026-05-28T15:00:00.000Z"
    } as const;
    const response = {
      block: {
        id: bookingId,
        reservationId,
        title: request.title,
        state: "active",
        startAt: request.startAt,
        endAt: request.endAt,
        createdAt: "2026-05-20T10:00:00.000Z",
        updatedAt: "2026-05-20T10:00:00.000Z"
      },
      replayed: false
    } as const;

    expect(createManualBlockRequestSchema.parse(request)).toEqual(request);
    expect(manualBlockResponseSchema.parse(response)).toEqual(response);
    expect(
      createManualBlockRequestSchema.safeParse({ ...request, endAt: request.startAt }).success
    ).toBe(false);
    expect(
      createManualBlockRequestSchema.safeParse({
        ...request,
        endAt: "2027-06-01T10:00:00.000Z"
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
        source: "manual",
        state: "confirmed",
        lifecycleRevision: 1,
        holdExpiresAt: null,
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

  it("accepts paid booking lifecycle states without widening manual booking creation", () => {
    expect(bookingLifecycleStateSchema.options).toEqual([
      "hold",
      "pending_payment",
      "confirmed",
      "completed",
      "cancelled",
      "no_show",
      "expired"
    ]);

    const heldBooking = {
      id: bookingId,
      reservationId,
      clientUserId,
      productId,
      source: "client_paid",
      state: "hold",
      lifecycleRevision: 0,
      holdExpiresAt: "2026-05-20T10:15:00.000Z",
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
    } as const;

    expect(bookingResponseSchema.parse({ booking: heldBooking })).toEqual({
      booking: heldBooking
    });
    expect(
      manualBookingResponseSchema.safeParse({ booking: heldBooking, replayed: false }).success
    ).toBe(false);
  });

  it("binds cancellation to an expected lifecycle revision and immutable event", () => {
    const request = {
      expectedLifecycleRevision: 1,
      reasonCode: "astrologer_unavailable"
    } as const;
    const response = {
      booking: {
        id: bookingId,
        reservationId,
        clientUserId,
        productId,
        source: "manual",
        state: "cancelled",
        lifecycleRevision: 2,
        holdExpiresAt: null,
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
        updatedAt: "2026-05-21T10:00:00.000Z"
      },
      lifecycleEvent: {
        id: "66666666-6666-4666-8666-666666666666",
        revision: 2,
        kind: "cancelled",
        reasonCode: "astrologer_unavailable",
        occurredAt: "2026-05-21T10:00:00.000Z"
      },
      replayed: false
    } as const;

    expect(cancelBookingRequestSchema.parse(request)).toEqual(request);
    expect(cancelBookingResponseSchema.parse(response)).toEqual(response);
    expect(
      cancelBookingRequestSchema.safeParse({ ...request, expectedLifecycleRevision: 0 }).success
    ).toBe(false);
    expect(
      cancelBookingRequestSchema.safeParse({ ...request, reasonCode: "refund_everything" }).success
    ).toBe(false);
    expect(
      cancelBookingResponseSchema.safeParse({
        ...response,
        lifecycleEvent: { ...response.lifecycleEvent, revision: 3 }
      }).success
    ).toBe(false);
  });

  it("binds paid live completion to the current lifecycle revision", () => {
    const request = { expectedLifecycleRevision: 2 } as const;
    const response = {
      booking: {
        id: bookingId,
        reservationId,
        clientUserId,
        productId,
        source: "client_paid",
        state: "completed",
        lifecycleRevision: 3,
        holdExpiresAt: null,
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
        updatedAt: "2026-05-29T09:01:00.000Z"
      },
      lifecycleEvent: {
        id: "77777777-7777-4777-8777-777777777777",
        revision: 3,
        kind: "completed",
        reasonCode: null,
        occurredAt: "2026-05-29T09:01:00.000Z"
      },
      replayed: false
    } as const;

    expect(completeBookingRequestSchema.parse(request)).toEqual(request);
    expect(completeBookingResponseSchema.parse(response)).toEqual(response);
    expect(
      completeBookingResponseSchema.safeParse({
        ...response,
        booking: { ...response.booking, source: "manual" }
      }).success
    ).toBe(false);
    expect(
      completeBookingResponseSchema.safeParse({
        ...response,
        lifecycleEvent: { ...response.lifecycleEvent, revision: 2 }
      }).success
    ).toBe(false);
  });

  it("binds an accepted reschedule to a new start and immutable lifecycle revision", () => {
    const request = {
      expectedLifecycleRevision: 1,
      projectedStartAt: "2026-05-30T12:00:00.000Z"
    } as const;
    const response = {
      booking: {
        id: bookingId,
        reservationId,
        clientUserId,
        productId,
        source: "client_paid",
        state: "confirmed",
        lifecycleRevision: 2,
        holdExpiresAt: null,
        startAt: request.projectedStartAt,
        endAt: "2026-05-30T13:00:00.000Z",
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
        updatedAt: "2026-05-21T10:00:00.000Z"
      },
      lifecycleEvent: {
        id: "77777777-7777-4777-8777-777777777777",
        revision: 2,
        kind: "rescheduled",
        reasonCode: null,
        occurredAt: "2026-05-21T10:00:00.000Z"
      },
      replayed: false
    } as const;

    expect(rescheduleBookingRequestSchema.parse(request)).toEqual(request);
    expect(rescheduleBookingResponseSchema.parse(response)).toEqual(response);
    expect(
      rescheduleBookingRequestSchema.safeParse({ ...request, expectedLifecycleRevision: 0 }).success
    ).toBe(false);
    expect(
      rescheduleBookingRequestSchema.safeParse({ ...request, projectedStartAt: "tomorrow" }).success
    ).toBe(false);
    expect(
      rescheduleBookingResponseSchema.safeParse({
        ...response,
        lifecycleEvent: { ...response.lifecycleEvent, revision: 3 }
      }).success
    ).toBe(false);
  });

  it("validates the public paid booking hold request and response", () => {
    const request = {
      astrologerUserId: "77777777-7777-4777-8777-777777777777",
      productId,
      directLinkIntentId: null,
      deliveryFormat: "video",
      projectedStartAt: "2026-05-29T08:00:00.000Z"
    } as const;

    const response = {
      booking: {
        id: bookingId,
        reservationId,
        clientUserId,
        productId,
        source: "client_paid",
        state: "hold",
        lifecycleRevision: 0,
        holdExpiresAt: "2026-05-20T10:15:00.000Z",
        startAt: request.projectedStartAt,
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

    expect(createPaidBookingHoldRequestSchema.parse(request)).toEqual(request);
    expect(paidBookingHoldResponseSchema.parse(response)).toEqual(response);
    expect(
      createPaidBookingHoldRequestSchema.safeParse({
        ...request,
        projectedStartAt: "2026-05-29 11:00"
      }).success
    ).toBe(false);
  });
});
