import { z } from "@elevenhouse/validation";
import type { Booking } from "../bookings";
import { clientLifecycleStatusValues, type ClientLifecycleStatus } from "../clients";
import {
  flowSubscriptionEventTypeV2Values,
  type FlowSubscriptionEventTypeV2
} from "@elevenhouse/contracts";

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

export const FLOW_NEW_LEAD_ENROLLMENT_REQUESTED_EVENT =
  "flows.new_lead.enrollment_requested.v1" as const;

export type FlowNewLeadEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-new-lead-enrollment-request.v1";
  readonly eventKind: "new_lead";
  readonly source: "clients";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: { readonly relationshipId: string };
};

export const flowNewLeadEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowNewLeadEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-new-lead-enrollment-request.v1"),
      eventKind: z.literal("new_lead"),
      source: z.literal("clients"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z.object({ relationshipId: z.string().uuid() }).strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.payload.relationshipId ||
        value.sourceEventId !== `client-relationship:${value.payload.relationshipId}:created`
      ) {
        context.addIssue({
          code: "custom",
          message: "New-lead enrollment transport identities must agree"
        });
      }
    });

export function createNewLeadFlowEnrollmentRequestedPayload(input: {
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly createdAt: string;
}): FlowNewLeadEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-new-lead-enrollment-request.v1",
    eventKind: "new_lead",
    source: "clients",
    sourceEventId: `client-relationship:${input.relationshipId}:created`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.relationshipId,
    occurredAt: input.createdAt,
    payloadSchemaVersion: 1,
    payload: { relationshipId: input.relationshipId }
  };
}

export const FLOW_FREE_PRODUCT_RECEIVED_ENROLLMENT_REQUESTED_EVENT =
  "flows.free_product_received.enrollment_requested.v1" as const;

export type FlowFreeProductReceivedEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-free-product-received-enrollment-request.v1";
  readonly eventKind: "free_product_received";
  readonly source: "product";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: {
    readonly receiptId: string;
    readonly relationshipId: string;
    readonly productId: string;
  };
};

export const flowFreeProductReceivedEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowFreeProductReceivedEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-free-product-received-enrollment-request.v1"),
      eventKind: z.literal("free_product_received"),
      source: z.literal("product"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z
        .object({
          receiptId: z.string().uuid(),
          relationshipId: z.string().uuid(),
          productId: z.string().uuid()
        })
        .strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.payload.receiptId ||
        value.sourceEventId !== `free-product:${value.payload.receiptId}:received`
      ) {
        context.addIssue({
          code: "custom",
          message: "Free-product enrollment transport identities must agree"
        });
      }
    });

export function createFreeProductReceivedFlowEnrollmentRequestedPayload(input: {
  readonly receiptId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly productId: string;
  readonly receivedAt: string;
}): FlowFreeProductReceivedEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-free-product-received-enrollment-request.v1",
    eventKind: "free_product_received",
    source: "product",
    sourceEventId: `free-product:${input.receiptId}:received`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.receiptId,
    occurredAt: input.receivedAt,
    payloadSchemaVersion: 1,
    payload: {
      receiptId: input.receiptId,
      relationshipId: input.relationshipId,
      productId: input.productId
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

export const FLOW_ASTRO_EVENT_ENROLLMENT_REQUESTED_EVENT =
  "flows.astro_event.enrollment_requested.v1" as const;

export type FlowAstroEventEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-astro-event-enrollment-request.v1";
  readonly eventKind: "astro_event";
  readonly source: "astro_calendar";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: {
    readonly astroEventId: string;
    readonly relationshipId: string;
    readonly eventCode: string;
  };
};

export const flowAstroEventEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowAstroEventEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-astro-event-enrollment-request.v1"),
      eventKind: z.literal("astro_event"),
      source: z.literal("astro_calendar"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().trim().min(1).max(180),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z
        .object({
          astroEventId: z.string().uuid(),
          relationshipId: z.string().uuid(),
          eventCode: z.string().trim().min(1).max(160)
        })
        .strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.sourceEventId !==
          `astro-event:${value.payload.astroEventId}:${value.payload.eventCode}` ||
        value.occurrenceKey !== value.payload.astroEventId
      ) {
        context.addIssue({
          code: "custom",
          message: "Astro-event enrollment transport identities must agree"
        });
      }
    });

export function createAstroEventFlowEnrollmentRequestedPayload(input: {
  readonly astroEventId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly eventCode: string;
  readonly occurredAt: string;
}): FlowAstroEventEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-astro-event-enrollment-request.v1",
    eventKind: "astro_event",
    source: "astro_calendar",
    sourceEventId: `astro-event:${input.astroEventId}:${input.eventCode}`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.astroEventId,
    occurredAt: input.occurredAt,
    payloadSchemaVersion: 1,
    payload: {
      astroEventId: input.astroEventId,
      relationshipId: input.relationshipId,
      eventCode: input.eventCode
    }
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
  | FlowNewLeadEnrollmentRequestedPayloadV1
  | FlowFreeProductReceivedEnrollmentRequestedPayloadV1
  | FlowProductPurchasedEnrollmentRequestedPayloadV1
  | FlowFirstInboundMessageEnrollmentRequestedPayloadV1
  | FlowAstroEventEnrollmentRequestedPayloadV1
  | FlowClientLifecycleChangedEnrollmentRequestedPayloadV1
  | FlowScheduleTimeEnrollmentRequestedPayloadV1
  | FlowReviewReceivedEnrollmentRequestedPayloadV1
  | FlowSubscriptionEventEnrollmentRequestedPayloadV1;

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

export const FLOW_SCHEDULE_TIME_ENROLLMENT_REQUESTED_EVENT =
  "flows.schedule_time.enrollment_requested.v1" as const;

export type FlowScheduleTimeEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-schedule-time-enrollment-request.v1";
  readonly eventKind: "schedule_time";
  readonly source: "crm";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: {
    readonly scheduleOccurrenceId: string;
    readonly relationshipId: string;
    readonly scheduleKey: string;
  };
};

export const flowScheduleTimeEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowScheduleTimeEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-schedule-time-enrollment-request.v1"),
      eventKind: z.literal("schedule_time"),
      source: z.literal("crm"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().trim().min(1).max(180),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z
        .object({
          scheduleOccurrenceId: z.string().uuid(),
          relationshipId: z.string().uuid(),
          scheduleKey: z.string().trim().min(1).max(160)
        })
        .strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.sourceEventId !==
          `schedule:${value.payload.scheduleOccurrenceId}:${value.payload.scheduleKey}` ||
        value.occurrenceKey !== value.payload.scheduleOccurrenceId
      ) {
        context.addIssue({
          code: "custom",
          message: "Schedule-time enrollment transport identities must agree"
        });
      }
    });

export function createScheduleTimeFlowEnrollmentRequestedPayload(input: {
  readonly scheduleOccurrenceId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly scheduleKey: string;
  readonly firedAt: string;
}): FlowScheduleTimeEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-schedule-time-enrollment-request.v1",
    eventKind: "schedule_time",
    source: "crm",
    sourceEventId: `schedule:${input.scheduleOccurrenceId}:${input.scheduleKey}`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.scheduleOccurrenceId,
    occurredAt: input.firedAt,
    payloadSchemaVersion: 1,
    payload: {
      scheduleOccurrenceId: input.scheduleOccurrenceId,
      relationshipId: input.relationshipId,
      scheduleKey: input.scheduleKey
    }
  };
}

export const FLOW_REVIEW_RECEIVED_ENROLLMENT_REQUESTED_EVENT =
  "flows.review_received.enrollment_requested.v1" as const;

export type FlowReviewReceivedEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-review-received-enrollment-request.v1";
  readonly eventKind: "review_received";
  readonly source: "crm";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: { readonly reviewId: string; readonly relationshipId: string };
};

export const flowReviewReceivedEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowReviewReceivedEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-review-received-enrollment-request.v1"),
      eventKind: z.literal("review_received"),
      source: z.literal("crm"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z.object({ reviewId: z.string().uuid(), relationshipId: z.string().uuid() }).strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.payload.reviewId ||
        value.sourceEventId !== `review:${value.payload.reviewId}:received`
      ) {
        context.addIssue({
          code: "custom",
          message: "Review-received enrollment transport identities must agree"
        });
      }
    });

export function createReviewReceivedFlowEnrollmentRequestedPayload(input: {
  readonly reviewId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly receivedAt: string;
}): FlowReviewReceivedEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-review-received-enrollment-request.v1",
    eventKind: "review_received",
    source: "crm",
    sourceEventId: `review:${input.reviewId}:received`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.reviewId,
    occurredAt: input.receivedAt,
    payloadSchemaVersion: 1,
    payload: { reviewId: input.reviewId, relationshipId: input.relationshipId }
  };
}

export const FLOW_SUBSCRIPTION_EVENT_ENROLLMENT_REQUESTED_EVENT =
  "flows.subscription_event.enrollment_requested.v1" as const;

export type FlowSubscriptionEventEnrollmentRequestedPayloadV1 = {
  readonly schemaVersion: "flow-subscription-event-enrollment-request.v1";
  readonly eventKind: "subscription_event";
  readonly source: "order";
  readonly sourceEventId: string;
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAt: string;
  readonly payloadSchemaVersion: 1;
  readonly payload: {
    readonly subscriptionEventId: string;
    readonly relationshipId: string;
    readonly eventType: FlowSubscriptionEventTypeV2;
  };
};

export const flowSubscriptionEventEnrollmentRequestedPayloadV1Schema: z.ZodType<FlowSubscriptionEventEnrollmentRequestedPayloadV1> =
  z
    .object({
      schemaVersion: z.literal("flow-subscription-event-enrollment-request.v1"),
      eventKind: z.literal("subscription_event"),
      source: z.literal("order"),
      sourceEventId: z.string().trim().min(1).max(180),
      subjectType: z.literal("client"),
      subjectId: z.string().uuid(),
      occurrenceKey: z.string().uuid(),
      occurredAt: z.string().datetime(),
      payloadSchemaVersion: z.literal(1),
      payload: z
        .object({
          subscriptionEventId: z.string().uuid(),
          relationshipId: z.string().uuid(),
          eventType: z.enum(flowSubscriptionEventTypeV2Values)
        })
        .strict()
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.occurrenceKey !== value.payload.subscriptionEventId ||
        value.sourceEventId !==
          `subscription:${value.payload.subscriptionEventId}:${value.payload.eventType}`
      ) {
        context.addIssue({
          code: "custom",
          message: "Subscription-event enrollment transport identities must agree"
        });
      }
    });

export function createSubscriptionEventFlowEnrollmentRequestedPayload(input: {
  readonly subscriptionEventId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly eventType: FlowSubscriptionEventTypeV2;
  readonly occurredAt: string;
}): FlowSubscriptionEventEnrollmentRequestedPayloadV1 {
  void input.ownerUserId;
  return {
    schemaVersion: "flow-subscription-event-enrollment-request.v1",
    eventKind: "subscription_event",
    source: "order",
    sourceEventId: `subscription:${input.subscriptionEventId}:${input.eventType}`,
    subjectType: "client",
    subjectId: input.clientUserId,
    occurrenceKey: input.subscriptionEventId,
    occurredAt: input.occurredAt,
    payloadSchemaVersion: 1,
    payload: {
      subscriptionEventId: input.subscriptionEventId,
      relationshipId: input.relationshipId,
      eventType: input.eventType
    }
  };
}
