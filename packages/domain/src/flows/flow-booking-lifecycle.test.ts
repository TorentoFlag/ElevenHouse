import { describe, expect, it } from "vitest";

import { createBookingLifecycleEvent, type BookingLifecycleEvent } from "../bookings";
import {
  FlowBookingLifecycleDeferredError,
  FlowBookingLifecycleIntegrityError,
  planFlowBookingLifecycleTransition,
  type FlowBookingLifecycleHead,
  type FlowBookingLifecycleReceiptIdentity
} from "./flow-booking-lifecycle";

const ids = {
  booking: "11111111-1111-4111-8111-111111111111",
  owner: "22222222-2222-4222-8222-222222222222",
  actor: "33333333-3333-4333-8333-333333333333",
  confirmed: "44444444-4444-4444-8444-444444444444",
  rescheduled: "55555555-5555-4555-8555-555555555555",
  cancelled: "66666666-6666-4666-8666-666666666666"
  ,completed: "77777777-7777-4777-8777-777777777777"
} as const;

const firstSchedule = {
  startAt: "2026-08-08T09:00:00.000Z",
  endAt: "2026-08-08T10:00:00.000Z",
  timeZone: "Europe/Moscow"
} as const;

const nextSchedule = {
  startAt: "2026-08-10T12:00:00.000Z",
  endAt: "2026-08-10T13:00:00.000Z",
  timeZone: "Europe/Moscow"
} as const;

describe("Flow Booking lifecycle ordering", () => {
  it("applies confirmation, reschedule and cancellation as one contiguous subject history", () => {
    const confirmation = confirmedEvent();
    const confirmed = planFlowBookingLifecycleTransition({
      head: null,
      receipt: null,
      event: confirmation
    });
    expect(confirmed).toEqual({
      kind: "apply",
      action: "enroll",
      nextHead: headFor(confirmation, "confirmed", firstSchedule)
    });

    const reschedule = rescheduledEvent();
    const rescheduled = planFlowBookingLifecycleTransition({
      head: confirmed.kind === "apply" ? confirmed.nextHead : null,
      receipt: null,
      event: reschedule
    });
    expect(rescheduled).toEqual({
      kind: "apply",
      action: "reschedule",
      nextHead: headFor(reschedule, "confirmed", nextSchedule)
    });

    const cancellation = cancelledEvent();
    expect(
      planFlowBookingLifecycleTransition({
        head: rescheduled.kind === "apply" ? rescheduled.nextHead : null,
        receipt: null,
        event: cancellation
      })
    ).toEqual({
      kind: "apply",
      action: "cancel",
      nextHead: headFor(cancellation, "cancelled", null)
    });
  });

  it("returns an exact persisted receipt as a replay without advancing state", () => {
    const event = confirmedEvent();
    const receipt: FlowBookingLifecycleReceiptIdentity = {
      lifecycleEventId: event.id,
      bookingId: event.bookingId,
      ownerUserId: event.ownerUserId,
      revision: event.revision,
      eventKind: event.kind,
      canonicalDigest: event.canonicalDigest
    };

    expect(
      planFlowBookingLifecycleTransition({
        head: headFor(event, "confirmed", firstSchedule),
        receipt,
        event
      })
    ).toEqual({ kind: "replay", receipt });
  });

  it("records completion as a terminal lifecycle receipt without inventing a Flow run", () => {
    const confirmation = confirmedEvent();
    const completion = completedEvent();

    expect(
      planFlowBookingLifecycleTransition({
        head: headFor(confirmation, "confirmed", firstSchedule),
        receipt: null,
        event: completion
      })
    ).toEqual({
      kind: "apply",
      action: "complete",
      nextHead: headFor(completion, "completed", firstSchedule)
    });
  });

  it("quarantines a conflicting receipt identity", () => {
    const event = confirmedEvent();
    expect(() =>
      planFlowBookingLifecycleTransition({
        head: headFor(event, "confirmed", firstSchedule),
        receipt: {
          lifecycleEventId: event.id,
          bookingId: event.bookingId,
          ownerUserId: event.ownerUserId,
          revision: event.revision,
          eventKind: event.kind,
          canonicalDigest: `sha256:${"0".repeat(64)}`
        },
        event
      })
    ).toThrowError(
      expect.objectContaining<Partial<FlowBookingLifecycleIntegrityError>>({
        code: "FLOW_BOOKING_LIFECYCLE_RECEIPT_CONFLICT"
      })
    );
  });

  it("defers a revision gap without changing the current subject head", () => {
    const event = rescheduledEvent({ revision: 3 });
    const head = headFor(confirmedEvent(), "confirmed", firstSchedule);

    expect(() =>
      planFlowBookingLifecycleTransition({ head, receipt: null, event })
    ).toThrowError(
      expect.objectContaining<Partial<FlowBookingLifecycleDeferredError>>({
        code: "FLOW_BOOKING_LIFECYCLE_REVISION_GAP",
        expectedRevision: 2,
        receivedRevision: 3
      })
    );
  });

  it("quarantines an old event that has no durable receipt", () => {
    const confirmation = confirmedEvent();
    const head = headFor(rescheduledEvent(), "confirmed", nextSchedule);

    expect(() =>
      planFlowBookingLifecycleTransition({ head, receipt: null, event: confirmation })
    ).toThrowError(
      expect.objectContaining<Partial<FlowBookingLifecycleIntegrityError>>({
        code: "FLOW_BOOKING_LIFECYCLE_STALE_WITHOUT_RECEIPT"
      })
    );
  });

  it("quarantines a non-contiguous schedule preimage and any transition after cancellation", () => {
    const confirmed = headFor(confirmedEvent(), "confirmed", firstSchedule);
    const mismatched = rescheduledEvent({
      before: { ...firstSchedule, endAt: "2026-08-08T10:30:00.000Z" }
    });
    expect(() =>
      planFlowBookingLifecycleTransition({ head: confirmed, receipt: null, event: mismatched })
    ).toThrowError(
      expect.objectContaining<Partial<FlowBookingLifecycleIntegrityError>>({
        code: "FLOW_BOOKING_LIFECYCLE_TRANSITION_INVALID"
      })
    );

    const cancelled = headFor(cancelledEvent(), "cancelled", null);
    expect(() =>
      planFlowBookingLifecycleTransition({
        head: cancelled,
        receipt: null,
        event: rescheduledEvent({ revision: 4 })
      })
    ).toThrowError(
      expect.objectContaining<Partial<FlowBookingLifecycleIntegrityError>>({
        code: "FLOW_BOOKING_LIFECYCLE_TRANSITION_INVALID"
      })
    );
  });

  it("recomputes and verifies the canonical Booking event digest before planning", () => {
    const event: BookingLifecycleEvent = {
      ...confirmedEvent(),
      canonicalDigest: `sha256:${"f".repeat(64)}`
    };
    expect(() =>
      planFlowBookingLifecycleTransition({ head: null, receipt: null, event })
    ).toThrowError(
      expect.objectContaining<Partial<FlowBookingLifecycleIntegrityError>>({
        code: "FLOW_BOOKING_LIFECYCLE_DIGEST_INVALID"
      })
    );
  });
});

function confirmedEvent(): BookingLifecycleEvent {
  return createBookingLifecycleEvent({
    id: ids.confirmed,
    bookingId: ids.booking,
    ownerUserId: ids.owner,
    revision: 1,
    kind: "confirmed",
    actor: { kind: "astrologer", userId: ids.actor },
    reasonCode: null,
    before: null,
    after: firstSchedule,
    occurredAt: "2026-08-05T03:00:00.000Z"
  });
}

function rescheduledEvent(
  overrides: Partial<Pick<BookingLifecycleEvent, "revision" | "before">> = {}
): BookingLifecycleEvent {
  return createBookingLifecycleEvent({
    id: ids.rescheduled,
    bookingId: ids.booking,
    ownerUserId: ids.owner,
    revision: overrides.revision ?? 2,
    kind: "rescheduled",
    actor: { kind: "astrologer", userId: ids.actor },
    reasonCode: null,
    before: overrides.before ?? firstSchedule,
    after: nextSchedule,
    occurredAt: "2026-08-05T04:00:00.000Z"
  });
}

function cancelledEvent(): BookingLifecycleEvent {
  return createBookingLifecycleEvent({
    id: ids.cancelled,
    bookingId: ids.booking,
    ownerUserId: ids.owner,
    revision: 3,
    kind: "cancelled",
    actor: { kind: "astrologer", userId: ids.actor },
    reasonCode: "astrologer_unavailable",
    before: nextSchedule,
    after: null,
    occurredAt: "2026-08-05T05:00:00.000Z"
  });
}

function completedEvent(): BookingLifecycleEvent {
  return createBookingLifecycleEvent({
    id: ids.completed,
    bookingId: ids.booking,
    ownerUserId: ids.owner,
    revision: 2,
    kind: "completed",
    actor: { kind: "astrologer", userId: ids.actor },
    reasonCode: null,
    before: firstSchedule,
    after: null,
    occurredAt: "2026-08-08T10:01:00.000Z"
  });
}

function headFor(
  event: BookingLifecycleEvent,
  state: FlowBookingLifecycleHead["state"],
  schedule: FlowBookingLifecycleHead["schedule"]
): FlowBookingLifecycleHead {
  return {
    bookingId: event.bookingId,
    ownerUserId: event.ownerUserId,
    appliedRevision: event.revision,
    state,
    schedule,
    lastLifecycleEventId: event.id,
    lastCanonicalDigest: event.canonicalDigest
  };
}
