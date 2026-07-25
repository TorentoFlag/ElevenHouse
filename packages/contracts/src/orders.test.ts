import { describe, expect, it } from "vitest";
import { createOrderRequestSchema, orderResponseSchema, orderStatusSchema } from "./orders";

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  clientUserId: "22222222-2222-4222-8222-222222222222",
  astrologerUserId: "33333333-3333-4333-8333-333333333333",
  productId: "44444444-4444-4444-8444-444444444444",
  directLinkIntentId: "55555555-5555-4555-8555-555555555555",
  bookingId: null,
  status: "pending_payment",
  grossAmount: { amountMinor: 500_00, currency: "RUB" },
  platformFee: { amountMinor: 50_00, currency: "RUB" },
  astrologerNetAmount: { amountMinor: 450_00, currency: "RUB" },
  financePolicySnapshotId: "66666666-6666-4666-8666-666666666666",
  financePolicyRiskTier: "standard",
  financePolicyHoldDurationHours: 48,
  financePolicyReserveBps: 0,
  financePolicyReserveReleaseDelayDays: 0,
  financePolicyPlatformFeeBps: 1_000,
  financePolicyProviderSettlementRequired: true,
  createdAt: "2026-07-24T10:00:00.000Z",
  updatedAt: "2026-07-24T10:01:00.000Z"
} as const;

describe("order contracts", () => {
  it("captures direct-link order ownership by client and astrologer", () => {
    expect(orderResponseSchema.parse(order)).toEqual(order);
  });

  it("rejects unknown order states and unknown fields", () => {
    expect(orderStatusSchema.parse("paid")).toBe("paid");
    expect(orderStatusSchema.parse("chargeback")).toBe("chargeback");
    expect(() => orderStatusSchema.parse("provider_success")).toThrow();
    expect(() => orderResponseSchema.parse({ ...order, unexpected: true })).toThrow();
  });

  it("rejects inconsistent amount snapshots", () => {
    expect(() =>
      orderResponseSchema.parse({
        ...order,
        astrologerNetAmount: { amountMinor: 451_00, currency: "RUB" }
      })
    ).toThrow();
  });

  it("keeps browser idempotency outside the JSON request body", () => {
    expect(
      createOrderRequestSchema.parse({
        astrologerUserId: order.astrologerUserId,
        productId: order.productId,
        directLinkIntentId: order.directLinkIntentId
      })
    ).toEqual({
      astrologerUserId: order.astrologerUserId,
      productId: order.productId,
      directLinkIntentId: order.directLinkIntentId,
      bookingId: null,
      clientBirthDataId: null
    });

    expect(
      createOrderRequestSchema.parse({
        astrologerUserId: order.astrologerUserId,
        productId: order.productId
      })
    ).toEqual({
      astrologerUserId: order.astrologerUserId,
      productId: order.productId,
      directLinkIntentId: null,
      bookingId: null,
      clientBirthDataId: null
    });

    expect(() =>
      createOrderRequestSchema.parse({
        astrologerUserId: order.astrologerUserId,
        productId: order.productId,
        directLinkIntentId: order.directLinkIntentId,
        idempotencyKey: "order-create:client:request"
      })
    ).toThrow();
  });
});
