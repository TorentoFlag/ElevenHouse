import { describe, expect, it } from "vitest";

import type { Booking } from "../bookings";
import {
  FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
  createAstroEventFlowEnrollmentRequestedPayload,
  createClientLifecycleChangedFlowEnrollmentRequestedPayload,
  createFreeProductReceivedFlowEnrollmentRequestedPayload,
  createFirstInboundMessageFlowEnrollmentRequestedPayload,
  createBookingConfirmedFlowEnrollmentRequestedPayload,
  createNewLeadFlowEnrollmentRequestedPayload,
  createProductPurchasedFlowEnrollmentRequestedPayload,
  createReviewReceivedFlowEnrollmentRequestedPayload,
  createScheduleTimeFlowEnrollmentRequestedPayload,
  createSubscriptionEventFlowEnrollmentRequestedPayload,
  flowAstroEventEnrollmentRequestedPayloadV1Schema,
  flowBookingConfirmedEnrollmentRequestedPayloadV1Schema,
  flowClientLifecycleChangedEnrollmentRequestedPayloadV1Schema,
  flowFreeProductReceivedEnrollmentRequestedPayloadV1Schema,
  flowFirstInboundMessageEnrollmentRequestedPayloadV1Schema,
  flowNewLeadEnrollmentRequestedPayloadV1Schema,
  flowProductPurchasedEnrollmentRequestedPayloadV1Schema,
  flowReviewReceivedEnrollmentRequestedPayloadV1Schema,
  flowScheduleTimeEnrollmentRequestedPayloadV1Schema,
  flowSubscriptionEventEnrollmentRequestedPayloadV1Schema
} from "./flow-runtime-outbox";

describe("booking-confirmed Flow enrollment outbox contract", () => {
  it("publishes a versioned aggregate reference without trusting copied owner or client data", () => {
    const booking = confirmedBooking();

    expect(FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT).toBe(
      "flows.booking_confirmed.enrollment_requested.v1"
    );
    expect(createBookingConfirmedFlowEnrollmentRequestedPayload(booking)).toEqual({
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
    });
  });

  it("rejects emission before the Booking aggregate is confirmed", () => {
    expect(() =>
      createBookingConfirmedFlowEnrollmentRequestedPayload({
        ...confirmedBooking(),
        state: "pending_payment"
      })
    ).toThrow("Booking-confirmed Flow enrollment requires a confirmed booking");
  });

  it("strictly validates the transport envelope without accepting copied authority fields", () => {
    const payload = createBookingConfirmedFlowEnrollmentRequestedPayload(confirmedBooking());

    expect(flowBookingConfirmedEnrollmentRequestedPayloadV1Schema.parse(payload)).toEqual(payload);
    expect(
      flowBookingConfirmedEnrollmentRequestedPayloadV1Schema.safeParse({
        ...payload,
        ownerUserId: confirmedBooking().ownerUserId
      }).success
    ).toBe(false);
    expect(
      flowBookingConfirmedEnrollmentRequestedPayloadV1Schema.safeParse({
        ...payload,
        payload: {}
      }).success
    ).toBe(false);
  });
});

describe("product-purchased Flow enrollment outbox contract", () => {
  it("publishes only a source-derived order reference and product identifier", () => {
    const payload = createProductPurchasedFlowEnrollmentRequestedPayload({
      orderId: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      clientUserId: "33333333-3333-4333-8333-333333333333",
      productId: "44444444-4444-4444-8444-444444444444",
      capturedAt: "2026-08-13T10:00:00.000Z"
    });

    expect(payload).toMatchObject({
      eventKind: "product_purchased",
      source: "finance",
      sourceEventId: "order:11111111-1111-4111-8111-111111111111:captured",
      subjectType: "client",
      subjectId: "33333333-3333-4333-8333-333333333333",
      occurrenceKey: "11111111-1111-4111-8111-111111111111",
      payload: {
        orderId: "11111111-1111-4111-8111-111111111111",
        productId: "44444444-4444-4444-8444-444444444444"
      }
    });
    expect(flowProductPurchasedEnrollmentRequestedPayloadV1Schema.parse(payload)).toEqual(payload);
    expect(
      flowProductPurchasedEnrollmentRequestedPayloadV1Schema.safeParse({
        ...payload,
        sourceEventId: "order:00000000-0000-4000-8000-000000000000:captured"
      }).success
    ).toBe(false);
  });
});

describe("client-scoped Flow enrollment outbox contracts", () => {
  it("publishes strict envelopes for every non-purchase client event start", () => {
    const common = {
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      clientUserId: "33333333-3333-4333-8333-333333333333",
      relationshipId: "44444444-4444-4444-8444-444444444444"
    };
    const newLead = createNewLeadFlowEnrollmentRequestedPayload({
      ...common,
      createdAt: "2026-08-13T10:00:00.000Z"
    });
    const freeProduct = createFreeProductReceivedFlowEnrollmentRequestedPayload({
      ...common,
      receiptId: "55555555-5555-4555-8555-555555555555",
      productId: "66666666-6666-4666-8666-666666666666",
      receivedAt: "2026-08-13T10:01:00.000Z"
    });
    const astro = createAstroEventFlowEnrollmentRequestedPayload({
      ...common,
      astroEventId: "99999999-9999-4999-8999-999999999999",
      eventCode: "full_moon",
      occurredAt: "2026-08-13T10:02:00.000Z"
    });
    const schedule = createScheduleTimeFlowEnrollmentRequestedPayload({
      ...common,
      scheduleOccurrenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      scheduleKey: "weekly_digest",
      firedAt: "2026-08-13T10:03:00.000Z"
    });
    const review = createReviewReceivedFlowEnrollmentRequestedPayload({
      ...common,
      reviewId: "77777777-7777-4777-8777-777777777777",
      receivedAt: "2026-08-13T10:04:00.000Z"
    });
    const subscription = createSubscriptionEventFlowEnrollmentRequestedPayload({
      ...common,
      subscriptionEventId: "88888888-8888-4888-8888-888888888888",
      eventType: "renewed",
      occurredAt: "2026-08-13T10:05:00.000Z"
    });

    expect(flowNewLeadEnrollmentRequestedPayloadV1Schema.parse(newLead)).toEqual(newLead);
    expect(flowFreeProductReceivedEnrollmentRequestedPayloadV1Schema.parse(freeProduct)).toEqual(
      freeProduct
    );
    expect(flowAstroEventEnrollmentRequestedPayloadV1Schema.parse(astro)).toEqual(astro);
    expect(flowScheduleTimeEnrollmentRequestedPayloadV1Schema.parse(schedule)).toEqual(schedule);
    expect(flowReviewReceivedEnrollmentRequestedPayloadV1Schema.parse(review)).toEqual(review);
    expect(flowSubscriptionEventEnrollmentRequestedPayloadV1Schema.parse(subscription)).toEqual(
      subscription
    );
    expect(
      JSON.stringify([newLead, freeProduct, astro, schedule, review, subscription])
    ).not.toContain(common.ownerUserId);
  });

  it("does not transport inbound message content", () => {
    const payload = createFirstInboundMessageFlowEnrollmentRequestedPayload({
      messageId: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      clientUserId: "33333333-3333-4333-8333-333333333333",
      relationshipId: "44444444-4444-4444-8444-444444444444",
      receivedAt: "2026-08-13T10:00:00.000Z"
    });

    expect(payload).toMatchObject({
      eventKind: "first_inbound_message",
      source: "messaging",
      subjectType: "client",
      subjectId: "33333333-3333-4333-8333-333333333333",
      payload: {
        messageId: "11111111-1111-4111-8111-111111111111",
        relationshipId: "44444444-4444-4444-8444-444444444444"
      }
    });
    expect(JSON.stringify(payload)).not.toContain("message text");
    expect(flowFirstInboundMessageEnrollmentRequestedPayloadV1Schema.parse(payload)).toEqual(
      payload
    );
    expect(
      flowFirstInboundMessageEnrollmentRequestedPayloadV1Schema.safeParse({
        ...payload,
        payload: { ...payload.payload, messageText: "message text" }
      }).success
    ).toBe(false);
  });

  it("requires an exact lifecycle transition identity", () => {
    const payload = createClientLifecycleChangedFlowEnrollmentRequestedPayload({
      historyId: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      clientUserId: "33333333-3333-4333-8333-333333333333",
      relationshipId: "44444444-4444-4444-8444-444444444444",
      fromStatus: "new",
      toStatus: "active",
      occurredAt: "2026-08-13T10:00:00.000Z"
    });

    expect(payload).toMatchObject({
      eventKind: "client_lifecycle_changed",
      source: "clients",
      sourceEventId: "client-lifecycle:11111111-1111-4111-8111-111111111111",
      occurrenceKey: "11111111-1111-4111-8111-111111111111",
      payload: { fromStatus: "new", toStatus: "active" }
    });
    expect(flowClientLifecycleChangedEnrollmentRequestedPayloadV1Schema.parse(payload)).toEqual(
      payload
    );
    expect(
      flowClientLifecycleChangedEnrollmentRequestedPayloadV1Schema.safeParse({
        ...payload,
        payload: { ...payload.payload, toStatus: "new" }
      }).success
    ).toBe(false);
  });
});

function confirmedBooking(): Booking {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    reservationId: "22222222-2222-4222-8222-222222222222",
    ownerUserId: "33333333-3333-4333-8333-333333333333",
    clientUserId: "44444444-4444-4444-8444-444444444444",
    productId: "55555555-5555-4555-8555-555555555555",
    source: "client_paid",
    state: "confirmed",
    lifecycleRevision: 1,
    holdExpiresAt: null,
    startAt: "2026-08-08T09:00:00.000Z",
    endAt: "2026-08-08T10:00:00.000Z",
    productTitle: "Consultation",
    durationMinutes: 60,
    deliveryFormat: "video",
    priceMinor: 10_000,
    currency: "RUB",
    timeZone: "Europe/Moscow",
    policySnapshot: {
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 60
    },
    clientDataRequirementsSnapshot: {
      schemaVersion: "booking-client-data-requirements.v1",
      executionMode: "live",
      participantMode: "solo",
      requiredClientData: ["chart1"],
      methods: ["natal"]
    },
    createdAt: "2026-08-04T09:00:00.000Z",
    updatedAt: "2026-08-04T09:05:00.000Z"
  };
}
