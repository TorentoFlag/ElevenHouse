import { z } from "@elevenhouse/validation";
import type { Booking } from "../bookings";

export const FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT =
  "flows.booking_confirmed.enrollment_requested.v1" as const;

export type FlowBookingConfirmedEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-booking-confirmed-enrollment-request.v1";
  readonly eventKind: "booking_confirmed";
  readonly source: "booking";
  readonly sourceEventId: string;
  readonly subjectType: "booking";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: {
    readonly bookingId: string;
  };
};

export const flowBookingConfirmedEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowBookingConfirmedEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-booking-confirmed-enrollment-request.v1"),
      eventKind: z.literal("booking_confirmed"),
      source: z.literal("booking"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("booking"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z.object({ bookingId: z.string().uuid() }).strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.subjectId ||
        value.payload.bookingId !== value.subjectId ||
        value.sourceEventId !== `booking:${value.subjectId}:confirmed`
      ) {
        context.addIssue({
          code: "custom",
          message: "Booking enrollment transport identities must agree"
        });
      }
    });

export function createBookingConfirmedFlowEnrollmentRequestedPayload(
  booking: Booking
): FlowBookingConfirmedEnrollmentRequestedPayloadV1 {
  if (booking.state !== "confirmed") {
    throw new Error("Booking-confirmed Flow enrollment requires a confirmed booking");
  }

  return {
    schemaVersion: "flow-booking-confirmed-enrollment-request.v1",
    eventKind: "booking_confirmed",
    source: "booking",
    sourceEventId: `booking:${booking.id}:confirmed`,
    subjectType: "booking",
    subjectId: booking.id,
    occurrenceKey: booking.id,
    occurredAt: booking.updatedAt,
    payloadSchemaVersion: 1,
    payload: {
      bookingId: booking.id
    }
  };
}
