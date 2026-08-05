import {
  createBookingLifecycleEvent,
  type BookingLifecycleEvent,
  type BookingLifecycleEventKind,
  type BookingScheduleSnapshot
} from "../bookings";

export type FlowBookingLifecycleState = "confirmed" | "completed" | "cancelled";

export type FlowBookingLifecycleHead = {
  readonly bookingId: string;
  readonly ownerUserId: string;
  readonly appliedRevision: number;
  readonly state: FlowBookingLifecycleState;
  readonly schedule: BookingScheduleSnapshot | null;
  readonly lastLifecycleEventId: string;
  readonly lastCanonicalDigest: `sha256:${string}`;
};

export type FlowBookingLifecycleReceiptIdentity = {
  readonly lifecycleEventId: string;
  readonly bookingId: string;
  readonly ownerUserId: string;
  readonly revision: number;
  readonly eventKind: BookingLifecycleEventKind;
  readonly canonicalDigest: `sha256:${string}`;
};

export type FlowBookingLifecycleReceiptOutcome =
  | "enrolled"
  | "no_match"
  | "late_unmatched"
  | "subject_ineligible"
  | "suppressed"
  | "completed"
  | "canceled"
  | "rescheduled";

export type FlowBookingLifecycleProcessingResult = {
  readonly lifecycleEventId: string;
  readonly bookingId: string;
  readonly ownerUserId: string;
  readonly appliedRevision: number;
  readonly eventKind: BookingLifecycleEventKind;
  readonly outcome: FlowBookingLifecycleReceiptOutcome;
  readonly replayed: boolean;
  readonly affectedRunCount: number;
  readonly affectedWorkItemCount: number;
  readonly preservedCompletedWorkItemCount: number;
};

export type FlowBookingLifecycleStore = {
  readonly processBookingLifecycleEvent: (input: {
    readonly lifecycleEventId: string;
    readonly latenessHorizonMs: number;
    readonly futureSkewToleranceMs: number;
  }) => Promise<FlowBookingLifecycleProcessingResult>;
};

export type FlowBookingLifecycleTransitionPlan =
  | {
      readonly kind: "replay";
      readonly receipt: FlowBookingLifecycleReceiptIdentity;
    }
  | {
      readonly kind: "apply";
      readonly action: "enroll" | "reschedule" | "complete" | "cancel";
      readonly nextHead: FlowBookingLifecycleHead;
    };

export class FlowBookingLifecycleDeferredError extends Error {
  override readonly name = "FlowBookingLifecycleDeferredError";
  readonly code = "FLOW_BOOKING_LIFECYCLE_REVISION_GAP";

  constructor(
    readonly expectedRevision: number,
    readonly receivedRevision: number
  ) {
    super(
      `FLOW_BOOKING_LIFECYCLE_REVISION_GAP: expected revision ${expectedRevision}, received ${receivedRevision}`
    );
  }
}

export class FlowBookingLifecycleRuntimeDeferredError extends Error {
  override readonly name = "FlowBookingLifecycleRuntimeDeferredError";
  readonly code = "FLOW_BOOKING_LIFECYCLE_RUNTIME_DEFERRED";

  constructor(message: string) {
    super(`FLOW_BOOKING_LIFECYCLE_RUNTIME_DEFERRED: ${message}`);
  }
}

export class FlowBookingLifecycleIntegrityError extends Error {
  override readonly name = "FlowBookingLifecycleIntegrityError";

  constructor(
    readonly code:
      | "FLOW_BOOKING_LIFECYCLE_DIGEST_INVALID"
      | "FLOW_BOOKING_LIFECYCLE_EVENT_UNAVAILABLE"
      | "FLOW_BOOKING_LIFECYCLE_RECEIPT_CONFLICT"
      | "FLOW_BOOKING_LIFECYCLE_PROVENANCE_INVALID"
      | "FLOW_BOOKING_LIFECYCLE_RUNTIME_STATE_INVALID"
      | "FLOW_BOOKING_LIFECYCLE_SOURCE_CHAIN_INVALID"
      | "FLOW_BOOKING_LIFECYCLE_STALE_WITHOUT_RECEIPT"
      | "FLOW_BOOKING_LIFECYCLE_TRANSITION_INVALID",
    message: string
  ) {
    super(`${code}: ${message}`);
  }
}

export function planFlowBookingLifecycleTransition(input: {
  readonly head: FlowBookingLifecycleHead | null;
  readonly receipt: FlowBookingLifecycleReceiptIdentity | null;
  readonly event: BookingLifecycleEvent;
}): FlowBookingLifecycleTransitionPlan {
  assertCanonicalDigest(input.event);
  if (input.receipt) {
    if (!receiptMatchesEvent(input.receipt, input.event)) {
      throw new FlowBookingLifecycleIntegrityError(
        "FLOW_BOOKING_LIFECYCLE_RECEIPT_CONFLICT",
        "the stored receipt does not match the canonical Booking lifecycle event"
      );
    }
    return { kind: "replay", receipt: input.receipt };
  }

  const expectedRevision = (input.head?.appliedRevision ?? 0) + 1;
  if (input.event.revision < expectedRevision) {
    throw new FlowBookingLifecycleIntegrityError(
      "FLOW_BOOKING_LIFECYCLE_STALE_WITHOUT_RECEIPT",
      "an already applied Booking revision is missing its durable Flow receipt"
    );
  }
  if (input.event.revision > expectedRevision) {
    throw new FlowBookingLifecycleDeferredError(expectedRevision, input.event.revision);
  }

  assertHeadIdentity(input.head, input.event);
  if (!input.head) return planInitialConfirmation(input.event);
  if (input.head.state === "cancelled" || input.head.state === "completed") {
    throw transitionInvalid("a terminal Booking cannot advance Flow subject state");
  }
  if (!input.head.schedule) {
    throw transitionInvalid("a confirmed Flow Booking head requires a current schedule");
  }
  if (!schedulesEqual(input.head.schedule, input.event.before)) {
    throw transitionInvalid("the lifecycle event preimage does not match current Flow subject state");
  }

  if (input.event.kind === "rescheduled" && input.event.after) {
    return {
      kind: "apply",
      action: "reschedule",
      nextHead: toHead(input.event, "confirmed", input.event.after)
    };
  }
  if (input.event.kind === "cancelled" && input.event.after === null) {
    return {
      kind: "apply",
      action: "cancel",
      nextHead: toHead(input.event, "cancelled", null)
    };
  }
  if (input.event.kind === "completed" && input.event.after === null) {
    return {
      kind: "apply",
      action: "complete",
      nextHead: toHead(input.event, "completed", input.head.schedule)
    };
  }
  throw transitionInvalid("the lifecycle event kind is not valid for a confirmed Booking");
}

function planInitialConfirmation(
  event: BookingLifecycleEvent
): Extract<FlowBookingLifecycleTransitionPlan, { readonly kind: "apply" }> {
  if (event.kind !== "confirmed" || event.revision !== 1 || !event.after) {
    throw transitionInvalid("the first Flow Booking lifecycle event must be confirmation revision one");
  }
  return {
    kind: "apply",
    action: "enroll",
    nextHead: toHead(event, "confirmed", event.after)
  };
}

function assertCanonicalDigest(event: BookingLifecycleEvent): void {
  const reconstructed = createBookingLifecycleEvent({
    id: event.id,
    bookingId: event.bookingId,
    ownerUserId: event.ownerUserId,
    revision: event.revision,
    kind: event.kind,
    actor: event.actor,
    reasonCode: event.reasonCode,
    before: event.before,
    after: event.after,
    occurredAt: event.occurredAt
  });
  if (reconstructed.canonicalDigest !== event.canonicalDigest) {
    throw new FlowBookingLifecycleIntegrityError(
      "FLOW_BOOKING_LIFECYCLE_DIGEST_INVALID",
      "the persisted Booking lifecycle event does not match its canonical digest"
    );
  }
}

function assertHeadIdentity(
  head: FlowBookingLifecycleHead | null,
  event: BookingLifecycleEvent
): void {
  if (
    head &&
    (head.bookingId !== event.bookingId || head.ownerUserId !== event.ownerUserId)
  ) {
    throw new FlowBookingLifecycleIntegrityError(
      "FLOW_BOOKING_LIFECYCLE_PROVENANCE_INVALID",
      "the Booking lifecycle event does not belong to the persisted Flow subject head"
    );
  }
}

function receiptMatchesEvent(
  receipt: FlowBookingLifecycleReceiptIdentity,
  event: BookingLifecycleEvent
): boolean {
  return (
    receipt.lifecycleEventId === event.id &&
    receipt.bookingId === event.bookingId &&
    receipt.ownerUserId === event.ownerUserId &&
    receipt.revision === event.revision &&
    receipt.eventKind === event.kind &&
    receipt.canonicalDigest === event.canonicalDigest
  );
}

function schedulesEqual(
  left: BookingScheduleSnapshot | null,
  right: BookingScheduleSnapshot | null
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.startAt === right.startAt &&
    left.endAt === right.endAt &&
    left.timeZone === right.timeZone
  );
}

function toHead(
  event: BookingLifecycleEvent,
  state: FlowBookingLifecycleState,
  schedule: BookingScheduleSnapshot | null
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

function transitionInvalid(message: string): FlowBookingLifecycleIntegrityError {
  return new FlowBookingLifecycleIntegrityError(
    "FLOW_BOOKING_LIFECYCLE_TRANSITION_INVALID",
    message
  );
}
