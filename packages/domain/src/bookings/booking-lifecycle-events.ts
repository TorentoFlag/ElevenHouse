import { z } from "@elevenhouse/validation";

import {
  sha256CanonicalJson,
  type CanonicalJson
} from "../calculations/canonical-json";

export const BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED =
  "bookings.lifecycle_event.dispatch_requested.v1" as const;

export const bookingLifecycleEventKindValues = [
  "confirmed",
  "rescheduled",
  "completed",
  "cancelled"
] as const;
export type BookingLifecycleEventKind = (typeof bookingLifecycleEventKindValues)[number];

export const bookingCancellationReasonCodeValues = [
  "astrologer_unavailable",
  "client_request",
  "mutual_agreement",
  "other"
] as const;
export type BookingCancellationReasonCode =
  (typeof bookingCancellationReasonCodeValues)[number];

export type BookingScheduleSnapshot = {
  readonly startAt: string;
  readonly endAt: string;
  readonly timeZone: string;
};

export type BookingLifecycleActor =
  | { readonly kind: "system"; readonly userId: null }
  | { readonly kind: "astrologer" | "client"; readonly userId: string };

export type BookingLifecycleEvent = {
  readonly schemaVersion: "booking-lifecycle-event.v1";
  readonly id: string;
  readonly bookingId: string;
  readonly ownerUserId: string;
  readonly revision: number;
  readonly kind: BookingLifecycleEventKind;
  readonly actor: BookingLifecycleActor;
  readonly reasonCode: BookingCancellationReasonCode | null;
  readonly before: BookingScheduleSnapshot | null;
  readonly after: BookingScheduleSnapshot | null;
  readonly occurredAt: string;
  readonly canonicalDigest: `sha256:${string}`;
};

export type CreateBookingLifecycleEventInput = Omit<
  BookingLifecycleEvent,
  "schemaVersion" | "canonicalDigest"
>;

export const bookingLifecycleDispatchRequestedPayloadSchema = z
  .object({
    schemaVersion: z.literal("booking-lifecycle-event-dispatch-request.v1"),
    lifecycleEventId: z.string().uuid()
  })
  .strict();

export type BookingLifecycleDispatchRequestedPayload = z.infer<
  typeof bookingLifecycleDispatchRequestedPayloadSchema
>;

export function createBookingLifecycleEvent(
  input: CreateBookingLifecycleEventInput
): BookingLifecycleEvent {
  assertEventTransition(input);
  const canonical = {
    schemaVersion: "booking-lifecycle-event.v1",
    id: input.id,
    bookingId: input.bookingId,
    ownerUserId: input.ownerUserId,
    revision: input.revision,
    kind: input.kind,
    actor: input.actor,
    reasonCode: input.reasonCode,
    before: input.before,
    after: input.after,
    occurredAt: input.occurredAt
  } as const;
  return Object.freeze({
    ...canonical,
    canonicalDigest: sha256CanonicalJson(canonical as unknown as CanonicalJson)
  });
}

export function createBookingLifecycleEventDispatchPayload(
  event: Pick<BookingLifecycleEvent, "id">
): BookingLifecycleDispatchRequestedPayload {
  return {
    schemaVersion: "booking-lifecycle-event-dispatch-request.v1",
    lifecycleEventId: event.id
  };
}

function assertEventTransition(input: CreateBookingLifecycleEventInput): void {
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new TypeError("Booking lifecycle revision must be a positive integer");
  }
  if (input.kind === "confirmed") {
    if (input.revision !== 1 || input.before !== null || input.after === null) {
      throw new TypeError("Booking confirmation requires revision one and a new schedule snapshot");
    }
    if (input.reasonCode !== null) {
      throw new TypeError("Booking confirmation cannot carry a cancellation reason");
    }
    return;
  }
  if (input.kind === "rescheduled") {
    if (input.revision === 1) {
      throw new TypeError("Booking reschedule requires a revision after confirmation");
    }
    if (input.before === null || input.after === null) {
      throw new TypeError("Booking reschedule requires previous and next schedule snapshots");
    }
    if (input.reasonCode !== null) {
      throw new TypeError("Booking reschedule cannot carry a cancellation reason");
    }
    return;
  }
  if (input.kind === "completed") {
    if (input.revision === 1) {
      throw new TypeError("Booking completion requires a revision after confirmation");
    }
    if (input.before === null || input.after !== null || input.reasonCode !== null) {
      throw new TypeError("Booking completion requires the current schedule and no cancellation reason");
    }
    return;
  }
  if (input.revision === 1) {
    throw new TypeError("Booking cancellation requires a revision after confirmation");
  }
  if (input.before === null || input.after !== null) {
    throw new TypeError("Booking cancellation requires the previous schedule snapshot");
  }
  if (input.reasonCode === null) {
    throw new TypeError("Booking cancellation requires a reason code");
  }
}
