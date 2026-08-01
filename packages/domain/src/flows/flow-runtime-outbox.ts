import type {
  FlowRuntimeEventSource,
  FlowRunSubjectType,
  FlowTriggerKind
} from "@elevenhouse/contracts";
import type { Booking } from "../bookings";

export const FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT =
  "flows.runtime_event.dispatch_requested" as const;

export type FlowRuntimeDispatchRequestedPayload = {
  readonly ownerUserId: string;
  readonly triggerKind: FlowTriggerKind;
  readonly source: FlowRuntimeEventSource;
  readonly sourceEventId: string;
  readonly subjectType: FlowRunSubjectType;
  readonly subjectId: string;
  readonly occurredAt: string;
  readonly timeZone: string;
  readonly payload: Record<string, unknown>;
};

export function createBookingConfirmedFlowRuntimeDispatchPayload(
  booking: Booking
): FlowRuntimeDispatchRequestedPayload {
  return {
    ownerUserId: booking.ownerUserId,
    triggerKind: "booking_confirmed",
    source: "booking",
    sourceEventId: `booking:${booking.id}:confirmed`,
    subjectType: "booking",
    subjectId: booking.id,
    occurredAt: booking.updatedAt,
    timeZone: booking.timeZone,
    payload: {
      bookingId: booking.id,
      clientUserId: booking.clientUserId,
      productId: booking.productId,
      startAt: booking.startAt,
      endAt: booking.endAt
    }
  };
}
