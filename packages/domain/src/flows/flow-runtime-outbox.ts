import { z } from "@elevenhouse/validation";
import type { Booking } from "../bookings";
import { clientLifecycleStatusValues, type ClientLifecycleStatus } from "../clients";

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

export const FLOW_PRODUCT_PURCHASED_ENROLLMENT_REQUESTED_EVENT =
  "flows.product_purchased.enrollment_requested.v1" as const;

export type FlowProductPurchasedEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-product-purchased-enrollment-request.v1";
  readonly eventKind: "product_purchased";
  readonly source: "finance";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: { readonly orderId: string; readonly productId: string };
};

export const flowProductPurchasedEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowProductPurchasedEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-product-purchased-enrollment-request.v1"),
      eventKind: z.literal("product_purchased"),
      source: z.literal("finance"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z.object({ orderId: z.string().uuid(), productId: z.string().uuid() }).strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.payload.orderId ||
        value.sourceEventId !== `order:${value.payload.orderId}:captured`
      ) {
        context.addIssue({
          code: "custom",
          message: "Product-purchased enrollment transport identities must agree"
        });
      }
    });

export function createProductPurchasedFlowEnrollmentRequestedPayload(input: {
  readonly orderId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly capturedAt: string;
}): FlowProductPurchasedEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-product-purchased-enrollment-request.v1",
    eventKind: "product_purchased",
    source: "finance",
    sourceEventId: `order:${input.orderId}:captured`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.orderId,
    occurredAt: input.capturedAt,
    payloadSchemaVersion: 1,
    payload: { orderId: input.orderId, productId: input.productId }
  };
}

export const FLOW_FIRST_INBOUND_MESSAGE_ENROLLMENT_REQUESTED_EVENT =
  "flows.first_inbound_message.enrollment_requested.v1" as const;

export type FlowFirstInboundMessageEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-first-inbound-message-enrollment-request.v1";
  readonly eventKind: "first_inbound_message";
  readonly source: "messaging";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: { readonly messageId: string; readonly relationshipId: string };
};

export const flowFirstInboundMessageEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowFirstInboundMessageEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-first-inbound-message-enrollment-request.v1"),
      eventKind: z.literal("first_inbound_message"),
      source: z.literal("messaging"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z
        .object({ messageId: z.string().uuid(), relationshipId: z.string().uuid() })
        .strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.payload.messageId ||
        value.sourceEventId !== `message:${value.payload.messageId}:received`
      ) {
        context.addIssue({
          code: "custom",
          message: "First-inbound-message enrollment transport identities must agree"
        });
      }
    });

export function createFirstInboundMessageFlowEnrollmentRequestedPayload(input: {
  readonly messageId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly receivedAt: string;
}): FlowFirstInboundMessageEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-first-inbound-message-enrollment-request.v1",
    eventKind: "first_inbound_message",
    source: "messaging",
    sourceEventId: `message:${input.messageId}:received`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.messageId,
    occurredAt: input.receivedAt,
    payloadSchemaVersion: 1,
    payload: { messageId: input.messageId, relationshipId: input.relationshipId }
  };
}

export const FLOW_CLIENT_LIFECYCLE_CHANGED_ENROLLMENT_REQUESTED_EVENT =
  "flows.client_lifecycle_changed.enrollment_requested.v1" as const;

export type FlowClientLifecycleChangedEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-client-lifecycle-changed-enrollment-request.v1";
  readonly eventKind: "client_lifecycle_changed";
  readonly source: "clients";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: {
    readonly historyId: string;
    readonly relationshipId: string;
    readonly fromStatus: ClientLifecycleStatus | null;
    readonly toStatus: ClientLifecycleStatus;
  };
};

export const flowClientLifecycleChangedEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowClientLifecycleChangedEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-client-lifecycle-changed-enrollment-request.v1"),
      eventKind: z.literal("client_lifecycle_changed"),
      source: z.literal("clients"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z
        .object({
          historyId: z.string().uuid(),
          relationshipId: z.string().uuid(),
          fromStatus: z.enum(clientLifecycleStatusValues).nullable(),
          toStatus: z.enum(clientLifecycleStatusValues)
        })
        .strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.payload.historyId ||
        value.sourceEventId !== `client-lifecycle:${value.payload.historyId}` ||
        value.payload.fromStatus === value.payload.toStatus
      ) {
        context.addIssue({
          code: "custom",
          message: "Client-lifecycle enrollment transport identities must agree"
        });
      }
    });

export type FlowClientEventEnrollmentRequestedPayloadV1 =
  | FlowProductPurchasedEnrollmentRequestedPayloadV1
  | FlowFirstInboundMessageEnrollmentRequestedPayloadV1
  | FlowClientLifecycleChangedEnrollmentRequestedPayloadV1;

export function createClientLifecycleChangedFlowEnrollmentRequestedPayload(input: {
  readonly historyId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly fromStatus: ClientLifecycleStatus | null;
  readonly toStatus: ClientLifecycleStatus;
  readonly occurredAt: string;
}): FlowClientLifecycleChangedEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-client-lifecycle-changed-enrollment-request.v1",
    eventKind: "client_lifecycle_changed",
    source: "clients",
    sourceEventId: `client-lifecycle:${input.historyId}`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.historyId,
    occurredAt: input.occurredAt,
    payloadSchemaVersion: 1,
    payload: {
      historyId: input.historyId,
      relationshipId: input.relationshipId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus
    }
  };
}
