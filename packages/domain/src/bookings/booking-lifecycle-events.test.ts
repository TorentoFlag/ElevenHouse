import { describe, expect, it } from "vitest";

import {
  BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
  bookingLifecycleDispatchRequestedPayloadSchema,
  createBookingLifecycleEvent,
  createBookingLifecycleEventDispatchPayload
} from "./booking-lifecycle-events";

const ids = {
  event: "11111111-1111-4111-8111-111111111111",
  booking: "22222222-2222-4222-8222-222222222222",
  owner: "33333333-3333-4333-8333-333333333333",
  actor: "44444444-4444-4444-8444-444444444444"
} as const;

describe("Booking lifecycle events", () => {
  it("creates an immutable revisioned confirmed event and IDs-only dispatch payload", () => {
    const event = createBookingLifecycleEvent({
      id: ids.event,
      bookingId: ids.booking,
      ownerUserId: ids.owner,
      revision: 1,
      kind: "confirmed",
      actor: { kind: "astrologer", userId: ids.actor },
      reasonCode: null,
      before: null,
      after: {
        startAt: "2026-08-08T09:00:00.000Z",
        endAt: "2026-08-08T10:00:00.000Z",
        timeZone: "Europe/Moscow"
      },
      occurredAt: "2026-08-05T03:00:00.000Z"
    });

    expect(event).toMatchObject({
      schemaVersion: "booking-lifecycle-event.v1",
      id: ids.event,
      bookingId: ids.booking,
      revision: 1,
      kind: "confirmed",
      canonicalDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED).toBe(
      "bookings.lifecycle_event.dispatch_requested.v1"
    );
    expect(
      bookingLifecycleDispatchRequestedPayloadSchema.parse(
        createBookingLifecycleEventDispatchPayload(event)
      )
    ).toEqual({
      schemaVersion: "booking-lifecycle-event-dispatch-request.v1",
      lifecycleEventId: ids.event
    });
  });

  it("rejects incoherent event transitions before persistence", () => {
    expect(() =>
      createBookingLifecycleEvent({
        id: ids.event,
        bookingId: ids.booking,
        ownerUserId: ids.owner,
        revision: 2,
        kind: "cancelled",
        actor: { kind: "astrologer", userId: ids.actor },
        reasonCode: "astrologer_unavailable",
        before: null,
        after: null,
        occurredAt: "2026-08-05T03:00:00.000Z"
      })
    ).toThrow("Booking cancellation requires the previous schedule snapshot");

    const before = {
      startAt: "2026-08-08T09:00:00.000Z",
      endAt: "2026-08-08T10:00:00.000Z",
      timeZone: "Europe/Moscow"
    } as const;
    const after = {
      startAt: "2026-08-09T09:00:00.000Z",
      endAt: "2026-08-09T10:00:00.000Z",
      timeZone: "Europe/Moscow"
    } as const;

    expect(() =>
      createBookingLifecycleEvent({
        id: ids.event,
        bookingId: ids.booking,
        ownerUserId: ids.owner,
        revision: 1,
        kind: "rescheduled",
        actor: { kind: "astrologer", userId: ids.actor },
        reasonCode: null,
        before,
        after,
        occurredAt: "2026-08-05T03:00:00.000Z"
      })
    ).toThrow("Booking reschedule requires a revision after confirmation");

    expect(() =>
      createBookingLifecycleEvent({
        id: ids.event,
        bookingId: ids.booking,
        ownerUserId: ids.owner,
        revision: 1,
        kind: "cancelled",
        actor: { kind: "astrologer", userId: ids.actor },
        reasonCode: "astrologer_unavailable",
        before,
        after: null,
        occurredAt: "2026-08-05T03:00:00.000Z"
      })
    ).toThrow("Booking cancellation requires a revision after confirmation");
  });

  it("makes a paid service completion an immutable terminal event with its schedule preimage", () => {
    const before = {
      startAt: "2026-08-08T09:00:00.000Z",
      endAt: "2026-08-08T10:00:00.000Z",
      timeZone: "Europe/Moscow"
    } as const;
    const event = createBookingLifecycleEvent({
      id: ids.event,
      bookingId: ids.booking,
      ownerUserId: ids.owner,
      revision: 2,
      kind: "completed",
      actor: { kind: "astrologer", userId: ids.actor },
      reasonCode: null,
      before,
      after: null,
      occurredAt: "2026-08-08T10:01:00.000Z"
    });

    expect(event).toMatchObject({ kind: "completed", revision: 2, before, after: null });
  });
});
