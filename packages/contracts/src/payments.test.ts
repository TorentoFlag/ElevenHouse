import { describe, expect, it } from "vitest";
import {
  createCheckoutRequestSchema,
  paymentAttemptResponseSchema,
  paymentAttemptStatusSchema,
  paymentProviderEnvironmentSchema,
  paymentProviderEventSchema
} from "./payments";

describe("payment contracts", () => {
  it("captures provider correlation ids and strict webhook-driven states", () => {
    const attempt = {
      id: "11111111-1111-4111-8111-111111111111",
      orderId: "22222222-2222-4222-8222-222222222222",
      provider: "arc_pay",
      environment: "sandbox",
      status: "captured",
      amount: { amountMinor: 500_00, currency: "RUB" },
      providerPaymentId: "arc-payment-1",
      providerCheckoutId: "arc-checkout-1",
      idempotencyKey: "checkout-key-1",
      metadata: { orderPublicId: "EH-1001" },
      createdAt: "2026-07-24T10:00:00.000Z",
      updatedAt: "2026-07-24T10:01:00.000Z"
    } as const;

    expect(paymentAttemptResponseSchema.parse(attempt)).toEqual(attempt);
  });

  it("requires HTTPS return URLs and keeps the public idempotency key in the header", () => {
    expect(
      createCheckoutRequestSchema.safeParse({
        orderId: "11111111-1111-4111-8111-111111111111",
        successUrl: "https://client.elevenhouse.test/payments/success",
        failureUrl: "https://client.elevenhouse.test/payments/failure",
        cancelUrl: "https://client.elevenhouse.test/payments/cancel"
      }).success
    ).toBe(true);

    expect(
      createCheckoutRequestSchema.safeParse({
        orderId: "11111111-1111-4111-8111-111111111111",
        successUrl: "http://client.elevenhouse.test/payments/success",
        failureUrl: "https://client.elevenhouse.test/payments/failure",
        cancelUrl: "https://client.elevenhouse.test/payments/cancel"
      }).success
    ).toBe(false);
  });

  it("rejects browser-return-only payment states", () => {
    expect(paymentAttemptStatusSchema.parse("timeout")).toBe("timeout");
    expect(paymentAttemptStatusSchema.parse("expired")).toBe("expired");
    expect(paymentAttemptStatusSchema.parse("authorized")).toBe("authorized");
    expect(paymentAttemptStatusSchema.parse("settled")).toBe("settled");
    expect(() => paymentAttemptStatusSchema.parse("success_url_returned")).toThrow();
  });

  it("requires webhook events to carry provider ids, environment and raw metadata", () => {
    const event = {
      id: "11111111-1111-4111-8111-111111111111",
      provider: "arc_pay",
      environment: "live",
      providerWebhookId: "wh_1",
      providerPaymentId: "pay_1",
      type: "payment.captured",
      occurredAt: "2026-07-24T10:00:00.000Z",
      receivedAt: "2026-07-24T10:01:00.000Z",
      payload: { amount: 500_00, currency: "RUB" }
    } as const;

    expect(paymentProviderEventSchema.parse(event)).toEqual(event);
    expect(
      paymentProviderEventSchema.parse({ ...event, type: "payment.pending_3ds" })
    ).toMatchObject({
      type: "payment.pending_3ds"
    });
    expect(paymentProviderEventSchema.parse({ ...event, type: "payment.expired" })).toMatchObject({
      type: "payment.expired"
    });
    expect(() => paymentProviderEventSchema.parse({ ...event, type: "payment.success" })).toThrow();
    expect(() => paymentProviderEnvironmentSchema.parse("staging")).toThrow();
  });
});
