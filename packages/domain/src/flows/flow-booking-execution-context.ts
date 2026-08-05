import type { BookingScheduleSnapshot } from "../bookings";
import { projectCurrentBookingScheduleOntoFlowRunSnapshot } from "./flow-booking-reschedule";
import type { FlowBookingLifecycleHead } from "./flow-booking-lifecycle";

export type FlowBookingExecutionLifecycleContext = {
  readonly schemaVersion: "flow-booking-execution-context.v1";
  readonly bookingId: string;
  readonly appliedRevision: number;
  readonly lifecycleEventId: string;
  readonly canonicalDigest: `sha256:${string}`;
  readonly schedule: BookingScheduleSnapshot;
};

export type FlowBookingExecutionContextResult =
  | {
      readonly kind: "ready";
      readonly effectiveRunSnapshot: unknown;
      readonly bookingLifecycleContext: FlowBookingExecutionLifecycleContext | null;
    }
  | {
      readonly kind: "deferred";
      readonly bookingId: string;
      readonly appliedRevision: number;
      readonly aggregateRevision: number;
    };

export type FlowBookingExecutionAggregate = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly state: string;
  readonly lifecycleRevision: number;
  readonly schedule: BookingScheduleSnapshot;
};

export class FlowBookingExecutionContextIntegrityError extends Error {
  override readonly name = "FlowBookingExecutionContextIntegrityError";
  readonly code = "FLOW_TOKEN_RUNTIME_STATE_INVALID" as const;

  constructor(message: string) {
    super(`FLOW_TOKEN_RUNTIME_STATE_INVALID: ${message}`);
  }
}

export function resolveFlowBookingExecutionContext(input: {
  readonly enrollmentSnapshot: unknown;
  readonly ownerUserId: string;
  readonly runtimeEvent: {
    readonly source: string;
    readonly subjectType: string;
    readonly subjectId: string;
  };
  readonly booking: FlowBookingExecutionAggregate | null;
  readonly lifecycleHead: FlowBookingLifecycleHead | null;
  readonly requireAggregateFreshness: boolean;
}): FlowBookingExecutionContextResult {
  if (input.runtimeEvent.source !== "booking") {
    return {
      kind: "ready",
      effectiveRunSnapshot: input.enrollmentSnapshot,
      bookingLifecycleContext: null
    };
  }

  if (input.runtimeEvent.subjectType !== "booking") {
    throw invalidContext("a Booking runtime event requires a Booking subject");
  }
  const booking = input.booking;
  if (
    !booking ||
    booking.id !== input.runtimeEvent.subjectId ||
    booking.ownerUserId !== input.ownerUserId
  ) {
    throw invalidContext("the Booking aggregate does not match the Flow runtime subject");
  }
  if (!Number.isSafeInteger(booking.lifecycleRevision) || booking.lifecycleRevision < 1) {
    throw invalidContext("the Booking aggregate has no canonical lifecycle revision");
  }

  const head = input.lifecycleHead;
  if (!head) {
    if (input.requireAggregateFreshness) {
      return {
        kind: "deferred",
        bookingId: booking.id,
        appliedRevision: 0,
        aggregateRevision: booking.lifecycleRevision
      };
    }
    throw invalidContext("an already claimed Booking Flow token has no lifecycle head");
  }
  if (
    head.bookingId !== booking.id ||
    head.ownerUserId !== booking.ownerUserId ||
    head.appliedRevision < 1 ||
    head.appliedRevision > booking.lifecycleRevision
  ) {
    throw invalidContext("the Flow lifecycle head does not match the Booking aggregate revision");
  }
  if (head.state !== "confirmed" || !head.schedule) {
    throw invalidContext("a claimable Booking Flow token requires a confirmed lifecycle head");
  }
  if (booking.lifecycleRevision > head.appliedRevision && input.requireAggregateFreshness) {
    return {
      kind: "deferred",
      bookingId: booking.id,
      appliedRevision: head.appliedRevision,
      aggregateRevision: booking.lifecycleRevision
    };
  }
  if (
    booking.lifecycleRevision === head.appliedRevision &&
    (booking.state !== "confirmed" || !schedulesEqual(booking.schedule, head.schedule))
  ) {
    throw invalidContext("the current Booking aggregate disagrees with its applied Flow head");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(head.lastCanonicalDigest)) {
    throw invalidContext("the Flow lifecycle head has an invalid canonical digest");
  }

  const effectiveRunSnapshot = projectCurrentBookingScheduleOntoFlowRunSnapshot({
    runSnapshot: input.enrollmentSnapshot,
    bookingId: booking.id,
    schedule: head.schedule
  });
  return {
    kind: "ready",
    effectiveRunSnapshot,
    bookingLifecycleContext: {
      schemaVersion: "flow-booking-execution-context.v1",
      bookingId: booking.id,
      appliedRevision: head.appliedRevision,
      lifecycleEventId: head.lastLifecycleEventId,
      canonicalDigest: head.lastCanonicalDigest,
      schedule: head.schedule
    }
  };
}

function schedulesEqual(left: BookingScheduleSnapshot, right: BookingScheduleSnapshot): boolean {
  return (
    left.startAt === right.startAt && left.endAt === right.endAt && left.timeZone === right.timeZone
  );
}

function invalidContext(message: string): FlowBookingExecutionContextIntegrityError {
  return new FlowBookingExecutionContextIntegrityError(message);
}
