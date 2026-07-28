import { describe, expect, it } from "vitest";
import {
  adminPaymentReversalCaseReviewRequestSchema,
  adminPaymentReversalCaseReviewSchema,
  adminPaymentReversalCaseSchema,
  adminPaymentReversalQueueResponseSchema,
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

  it("exposes admin refund and chargeback queue cases with wallet risk evidence", () => {
    const chargeback = {
      id: "11111111-1111-4111-8111-111111111111",
      type: "chargeback",
      severity: "critical",
      provider: "arc_pay",
      environment: "sandbox",
      providerWebhookId: "wh_chargeback_1",
      providerPaymentId: "arc-payment-1",
      providerRefundId: null,
      paymentAttemptId: "22222222-2222-4222-8222-222222222222",
      orderId: "33333333-3333-4333-8333-333333333333",
      clientUserId: "44444444-4444-4444-8444-444444444444",
      astrologerUserId: "55555555-5555-4555-8555-555555555555",
      orderStatus: "chargeback",
      paymentAttemptStatus: "chargeback",
      amount: { amountMinor: 50_000, currency: "RUB" },
      refundStatus: null,
      ledgerOperationType: "chargeback_recorded",
      ledgerTransactionId: "66666666-6666-4666-8666-666666666666",
      review: {
        resolution: "provider_follow_up_required",
        adminNote: "Evidence package requested from Arc Pay support",
        reviewedByUserId: "77777777-7777-4777-8777-777777777777",
        reviewedAt: "2026-07-24T10:03:00.000Z"
      },
      walletBalance: {
        astrologerUserId: "55555555-5555-4555-8555-555555555555",
        pending: { amountMinor: 0, currency: "RUB" },
        available: { amountMinor: 0, currency: "RUB" },
        reserved: { amountMinor: 0, currency: "RUB" },
        payoutPending: { amountMinor: 0, currency: "RUB" },
        negativeBalance: { amountMinor: 45_000, currency: "RUB" },
        updatedAt: "2026-07-24T10:02:00.000Z"
      },
      occurredAt: "2026-07-24T10:00:00.000Z",
      receivedAt: "2026-07-24T10:01:00.000Z"
    } as const;

    expect(adminPaymentReversalCaseSchema.parse(chargeback)).toEqual(chargeback);
    expect(adminPaymentReversalCaseReviewSchema.parse(chargeback.review)).toEqual(
      chargeback.review
    );
    expect(
      adminPaymentReversalQueueResponseSchema.parse({
        summary: {
          refundCount: 0,
          chargebackCount: 1,
          criticalCount: 1,
          totalAmount: { amountMinor: 50_000, currency: "RUB" },
          negativeBalanceAmount: { amountMinor: 45_000, currency: "RUB" }
        },
        cases: [chargeback]
      })
    ).toMatchObject({ summary: { chargebackCount: 1, criticalCount: 1 } });
  });

  it("rejects refund queue cases without provider refund evidence", () => {
    expect(() =>
      adminPaymentReversalCaseSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        type: "refund",
        severity: "attention",
        provider: "arc_pay",
        environment: "sandbox",
        providerWebhookId: "wh_refund_1",
        providerPaymentId: "arc-payment-1",
        providerRefundId: null,
        paymentAttemptId: "22222222-2222-4222-8222-222222222222",
        orderId: "33333333-3333-4333-8333-333333333333",
        clientUserId: "44444444-4444-4444-8444-444444444444",
        astrologerUserId: "55555555-5555-4555-8555-555555555555",
        orderStatus: "refunded",
        paymentAttemptStatus: "refunded",
        amount: { amountMinor: 50_000, currency: "RUB" },
        refundStatus: "succeeded",
        ledgerOperationType: "refund_recorded",
        ledgerTransactionId: "66666666-6666-4666-8666-666666666666",
        review: null,
        walletBalance: null,
        occurredAt: "2026-07-24T10:00:00.000Z",
        receivedAt: "2026-07-24T10:01:00.000Z"
      })
    ).toThrow();
  });

  it("requires a durable admin note before an operator can review a reversal case", () => {
    expect(
      adminPaymentReversalCaseReviewRequestSchema.parse({
        resolution: "ledger_verified",
        adminNote: "Provider reversal and ElevenHouse ledger transaction are matched"
      })
    ).toEqual({
      resolution: "ledger_verified",
      adminNote: "Provider reversal and ElevenHouse ledger transaction are matched"
    });

    expect(
      adminPaymentReversalCaseReviewRequestSchema.safeParse({
        resolution: "ledger_verified",
        adminNote: " "
      }).success
    ).toBe(false);
    expect(
      adminPaymentReversalCaseReviewRequestSchema.safeParse({
        resolution: "provider_refund_succeeded",
        adminNote: "Do not model provider success from admin review"
      }).success
    ).toBe(false);
  });
});
